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
readonly RBE_LINE="common --config=rbe"

# When invoked under `bazel run`, BUILD_WORKSPACE_DIRECTORY points at the
# workspace root. Otherwise fall back to the git toplevel of the cwd.
readonly LOCAL_WORKSPACE="${BUILD_WORKSPACE_DIRECTORY:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"

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
  WORKSTATION_NO_BAZELRC Set to skip copying \$LOCAL_WORKSPACE/.bazelrc.user
                         to the VM and appending --config=rbe.
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

# Copy laptop's .bazelrc.user into the freshly-cloned senku checkout
# on the VM, then append --config=rbe so bazel uses the BuildBuddy
# RBE platform automatically. Skipped if WORKSTATION_NO_BAZELRC is set.
seed_bazelrc() {
    local name="$1"
    if [ -n "${WORKSTATION_NO_BAZELRC:-}" ]; then
        return 0
    fi
    if [ -z "${LOCAL_WORKSPACE}" ] || [ ! -f "${LOCAL_WORKSPACE}/.bazelrc.user" ]; then
        echo "exevm: no local .bazelrc.user found at ${LOCAL_WORKSPACE:-(unknown workspace)}; skipping seed" >&2
        return 0
    fi
    scp -q -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR \
        "${LOCAL_WORKSPACE}/.bazelrc.user" \
        "${name}.exe.xyz:${REPO_DIR_ON_VM}/.bazelrc.user"
    # Idempotent append: only add the RBE line if not already present.
    ssh -o LogLevel=ERROR "${name}.exe.xyz" \
        "grep -qxF '${RBE_LINE}' ${REPO_DIR_ON_VM}/.bazelrc.user || echo '${RBE_LINE}' >> ${REPO_DIR_ON_VM}/.bazelrc.user"
    echo "exevm: seeded ${name}:~/${REPO_DIR_ON_VM}/.bazelrc.user" >&2
}

cmd_new() {
    local name="${1:-}"
    local new_args=(--image="$IMAGE" --tag="$TAG")
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
        wait_for_clone "$vm" && seed_bazelrc "$vm"
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
