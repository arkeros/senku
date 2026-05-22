#!/usr/bin/env bash
# Wrapper around the `pin` Go binary. Runs under `bazel run`, so
# BUILD_WORKSPACE_DIRECTORY is the consumer's source tree.
set -euo pipefail

# {TOOL} and {SIGNING_KEY} are runfiles-relative paths; resolve both to
# absolute *before* cd so the exec below survives the working-directory
# switch into the consumer's source tree.
TOOL_ABS="$(cd "$(dirname "{TOOL}")" && pwd)/$(basename "{TOOL}")"
SIGNING_KEY_ABS="$(cd "$(dirname "{SIGNING_KEY}")" && pwd)/$(basename "{SIGNING_KEY}")"

cd "${BUILD_WORKSPACE_DIRECTORY:?must be invoked via bazel run}"

exec "$TOOL_ABS" \
    --repo-url "{REPO_URL}" \
    --signing-key "$SIGNING_KEY_ABS" \
    --packages "{PACKAGES}" \
    --architectures "{ARCHITECTURES}" \
    --lock-out "{LOCK_FILE}" \
    "$@"
