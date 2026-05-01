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
  WORKSTATION_IMAGE  Override image (default: ${IMAGE})
EOF
}

cmd_new() {
    local name="${1:-}"
    local args=(--image="$IMAGE" --tag="$TAG")
    if [ -n "$name" ]; then
        args+=(--name="$name")
        shift
    fi
    ssh exe.dev new "${args[@]}" "$@"
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
