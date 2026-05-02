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

# Resolve a floating tag (typically :latest) to an immutable form so VMs
# created at different times don't drift. Prefers a CalVer-shaped tag
# (2026.18.45[-sha]) pointing at the same digest as :latest because
# that's human-readable; falls back to @sha256:... pinning when no
# CalVer tag matches. Pass-through for already-pinned refs and on any
# crane failure (missing binary, no auth, no network).
resolve_immutable_image() {
    local image="$1"
    case "$image" in
        *@sha256:*) echo "$image"; return ;;
    esac
    if ! command -v crane >/dev/null 2>&1; then
        echo "$image"
        return
    fi
    local repo="${image%:*}"
    local digest
    if ! digest=$(crane digest "$image" 2>/dev/null); then
        echo "$image"
        return
    fi
    local match
    match=$(crane ls "$repo" 2>/dev/null |
        grep -E '^[0-9]{4}\.[0-9]+\.[0-9]+(-[a-f0-9]+)?$' |
        sort -Vr |
        while read -r tag; do
            if [ "$(crane digest "${repo}:${tag}" 2>/dev/null)" = "$digest" ]; then
                echo "${repo}:${tag}"
                break
            fi
        done)
    if [ -n "$match" ]; then
        echo "$match"
    else
        echo "${repo}@${digest}"
    fi
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

    echo "exevm: open in Zed → zed://ssh/${vm}.exe.xyz/home/exedev/${REPO_DIR_ON_VM}" >&2
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
