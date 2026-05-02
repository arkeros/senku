#!/usr/bin/env bash
#
# exevm — manage exe.dev VMs running the senku/workstation image.
#
# Bakes in the image and tag so daily-use commands are short.
# Override the image with WORKSTATION_IMAGE if you need a specific
# digest or tag.
#
set -euo pipefail

readonly IMAGE="${WORKSTATION_IMAGE:-ghcr.io/arkeros/senku/workstation:latest}"
readonly TAG="arkeros-senku"
readonly REPO_URL="${WORKSTATION_REPO_URL:-https://arkeros-senku.int.exe.xyz/arkeros/senku.git}"
readonly REPO_DIR_ON_VM="senku"
readonly SEED_BAZELRC_LINES=(
    "common --config=rbe"
    # Build Without the Bytes: skip downloading intermediate outputs over
    # residential links. `toplevel` keeps locally-usable artifacts for the
    # targets the user explicitly built/tested.
    "common --remote_download_outputs=toplevel"
)

# When invoked under `bazel run`, BUILD_WORKSPACE_DIRECTORY points at the
# workspace root. Otherwise fall back to the git toplevel of the cwd.
readonly LOCAL_WORKSPACE="${BUILD_WORKSPACE_DIRECTORY:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"

readonly CALVER_TAG_RE='^[0-9]{4}\.[0-9]+\.[0-9]+(-[a-f0-9]+)?$'

# Resolve a floating tag (typically :latest) to a CalVer tag like
# 2026.18.45[-sha] pointing at the same digest. CalVer is required:
# exe.dev's data model stores only `repo + tag` and silently drops
# `@sha256:` pins, so falling back to a digest would erase the version
# from `exe.dev ls`. Pass-through if the input is already a CalVer tag
# or an explicit `@sha256:` digest (caller opted in). Anything else
# (crane missing, digest lookup fails, no CalVer match) is a hard error
# — refuse to provision a VM whose pin we can't observe later.
resolve_immutable_image() {
    local image="$1"
    case "$image" in
        *@sha256:*) echo "$image"; return ;;
    esac
    local existing_tag="${image##*:}"
    if [[ "$existing_tag" =~ $CALVER_TAG_RE ]]; then
        echo "$image"
        return
    fi
    if ! command -v crane >/dev/null 2>&1; then
        echo "exevm: crane not found; cannot pin $image to a CalVer tag" >&2
        return 1
    fi
    local repo="${image%:*}"
    local digest
    if ! digest=$(crane digest "$image" 2>/dev/null); then
        echo "exevm: crane digest failed for $image (auth/network?)" >&2
        return 1
    fi
    local match
    match=$(crane ls "$repo" 2>/dev/null |
        grep -E "$CALVER_TAG_RE" |
        sort -Vr |
        while read -r tag; do
            if [ "$(crane digest "${repo}:${tag}" 2>/dev/null)" = "$digest" ]; then
                echo "${repo}:${tag}"
                break
            fi
        done)
    if [ -z "$match" ]; then
        echo "exevm: no CalVer tag matches $image (digest=$digest)" >&2
        echo "exevm: refusing to fall back to @sha256: pin (exe.dev drops digests in ls)" >&2
        return 1
    fi
    echo "$match"
}

usage() {
    cat <<EOF
exevm — manage exe.dev VMs running senku/workstation

Usage: $(basename "$0") <command> [args]

Commands:
  new [name]   Create a VM (auto-named if omitted, ${TAG}-tagged)
  ls           List ${TAG}-tagged VMs
  rm <name>    Delete one or more VMs
  ssh <name>   Open a shell on a VM (forwards extra args to ssh)
  url <name>   Print the HTTPS URL

Env:
  WORKSTATION_IMAGE      Override image (default: ${IMAGE})
  WORKSTATION_REPO_URL   Override clone-on-boot repo (default: ${REPO_URL})
                         Set empty to skip cloning.
  WORKSTATION_NO_BAZELRC Set to skip writing --config=rbe and
                         copying the local .bazelrc.user.
  WORKSTATION_NO_ZED     Set to skip opening Zed after \`new\`. The
                         zed:// URL is still printed.
EOF
}

# Wait until <vm>.exe.xyz accepts ssh and the senku checkout exists.
# Returns the vm name (so it composes with the ssh exe.dev new JSON).
wait_for_clone() {
    local name="$1"
    local tries=0
    while ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \
                -o LogLevel=ERROR \
                "${name}.exe.xyz" \
                test -d "${REPO_DIR_ON_VM}/.git" 2>/dev/null; do
        tries=$((tries + 1))
        if [ "$tries" -gt 60 ]; then
            echo "exevm: timed out waiting for clone on ${name}" >&2
            return 1
        fi
        sleep 2
    done
}

# Seed the cloned workspace's .bazelrc.user:
#   - If $LOCAL_WORKSPACE/.bazelrc.user exists locally (it holds the
#     BuildBuddy API key), scp it onto the VM first.
#   - Append each line in SEED_BAZELRC_LINES so `bazel test //...` uses
#     RBE and Build-Without-the-Bytes by default. Idempotent.
# Skipped entirely if WORKSTATION_NO_BAZELRC is set.
seed_bazelrc() {
    local name="$1"
    if [ -n "${WORKSTATION_NO_BAZELRC:-}" ]; then
        return 0
    fi
    if [ -n "${LOCAL_WORKSPACE}" ] && [ -f "${LOCAL_WORKSPACE}/.bazelrc.user" ]; then
        scp -q -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR \
            "${LOCAL_WORKSPACE}/.bazelrc.user" \
            "${name}.exe.xyz:${REPO_DIR_ON_VM}/.bazelrc.user"
        echo "exevm: scp'd ${LOCAL_WORKSPACE}/.bazelrc.user → ${name}:~/${REPO_DIR_ON_VM}/.bazelrc.user" >&2
    fi
    local line
    for line in "${SEED_BAZELRC_LINES[@]}"; do
        ssh -o LogLevel=ERROR "${name}.exe.xyz" \
            "touch ${REPO_DIR_ON_VM}/.bazelrc.user && \
             grep -qxF '${line}' ${REPO_DIR_ON_VM}/.bazelrc.user || \
             echo '${line}' >> ${REPO_DIR_ON_VM}/.bazelrc.user"
        echo "exevm: ${name}:~/${REPO_DIR_ON_VM}/.bazelrc.user → '${line}'" >&2
    done
}

# Block on `bazel fetch //...` so cmd_new only returns once the VM is
# ready to build — keeps the user from ssh-ing in and racing the warmup.
warm_bazel() {
    local name="$1"
    echo "exevm: bazel fetch //... on ${name} (blocking)" >&2
    ssh -o LogLevel=ERROR "${name}.exe.xyz" \
        "cd ${REPO_DIR_ON_VM} && bazel fetch //..."
}

cmd_new() {
    local name="${1:-}"
    local resolved
    resolved=$(resolve_immutable_image "$IMAGE")
    if [ "$resolved" != "$IMAGE" ]; then
        echo "exevm: pinning $IMAGE → $resolved" >&2
    fi
    local new_args=(--image="$resolved" --tag="$TAG")
    if [ -n "$name" ]; then
        new_args+=(--name="$name")
        shift
    fi

    local response
    if [ -n "$REPO_URL" ]; then
        response=$(printf '#!/bin/sh\nset -eu\ncd /home/exedev\ngit clone --depth=1 %q %s\n' \
                            "$REPO_URL" "$REPO_DIR_ON_VM" |
            ssh exe.dev new "${new_args[@]}" --setup-script=/dev/stdin --json "$@")
    else
        response=$(ssh exe.dev new "${new_args[@]}" --json "$@")
    fi
    echo "$response"

    # Resolve the actual VM name (auto-generated if --name omitted).
    local vm
    vm=$(jq -r '.vm_name' <<<"$response")
    if [ -z "$vm" ] || [ "$vm" = "null" ]; then
        echo "exevm: could not parse vm_name from response; skipping post-create steps" >&2
        return 0
    fi

    if [ -n "$REPO_URL" ]; then
        wait_for_clone "$vm" && seed_bazelrc "$vm" && warm_bazel "$vm"
    fi

    local zed_url="zed://ssh/${vm}.exe.xyz/home/exedev/${REPO_DIR_ON_VM}"
    echo "exevm: open in Zed → ${zed_url}" >&2
    if [ -z "${WORKSTATION_NO_ZED:-}" ]; then
        if command -v open >/dev/null 2>&1; then
            open "$zed_url"
        elif command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$zed_url" >/dev/null 2>&1 &
        fi
    fi
}

cmd_ls() {
    # exe.dev's ls has no --tag filter; pull JSON and grep ourselves.
    # Output: NAME  STATUS  IMAGE — one per line.
    ssh exe.dev ls --json "$@" |
        jq -r --arg t "$TAG" '
            .vms[]
            | select(.tags // [] | index($t))
            | [.vm_name, .status, .image] | @tsv
        ' |
        column -t -s $'\t'
}

cmd_rm() {
    if [ $# -eq 0 ]; then
        echo "rm: at least one VM name required" >&2
        return 2
    fi
    ssh exe.dev rm "$@"
}

cmd_ssh() {
    if [ $# -eq 0 ]; then
        echo "ssh: VM name required" >&2
        return 2
    fi
    local name="$1"
    shift
    ssh -o StrictHostKeyChecking=accept-new "${name}.exe.xyz" "$@"
}

cmd_url() {
    if [ $# -eq 0 ]; then
        echo "url: VM name required" >&2
        return 2
    fi
    echo "https://${1}.exe.xyz"
}

main() {
    local cmd="${1:-help}"
    shift || true
    case "$cmd" in
        new)              cmd_new "$@" ;;
        ls)               cmd_ls "$@" ;;
        rm)               cmd_rm "$@" ;;
        ssh)              cmd_ssh "$@" ;;
        url)              cmd_url "$@" ;;
        help|-h|--help)   usage ;;
        *)                echo "unknown command: $cmd" >&2; usage >&2; exit 2 ;;
    esac
}

main "$@"
