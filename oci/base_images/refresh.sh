#!/usr/bin/env bash
# Refresh a checked-in base-image SBOM from its published attestation.
#
# Run this whenever the digest pinned in //bazel/include:oci.MODULE.bazel
# changes. The diff is the point: it shows exactly which packages the new base
# adds, drops or bumps, which a digest change on its own does not.
#
#   ./oci/base_images/refresh.sh nginx_stable \
#       ghcr.io/arkeros/distroless/nginx@sha256:<digest>
set -o errexit -o nounset -o pipefail

NAME="${1:?usage: refresh.sh <name> <image@digest>}"
REF="${2:?usage: refresh.sh <name> <image@digest>}"
OUT="$(dirname "$0")/${NAME}.cdx.json"

bazel build --remote_download_outputs=all //bazel/toolchains/cosign:compiled_cosign_toolchain
COSIGN="$(realpath "$(bazel cquery //bazel/toolchains/cosign:compiled_cosign_toolchain --output=files)")"

# Verified, not merely downloaded: an unverified SBOM is a document that looks
# like evidence. The identity must match what publishes the mirror.
"${COSIGN}" verify-attestation \
    --type=cyclonedx \
    --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
    --certificate-identity-regexp='^https://github\.com/arkeros/distroless/\.github/workflows/ci\.yaml@refs/heads/main$' \
    "${REF}" \
  | python3 -c '
import base64, json, sys
payload = json.loads(base64.b64decode(json.load(sys.stdin)["payload"]))
json.dump(payload["predicate"], sys.stdout, indent=2, sort_keys=True)
print()
' > "${OUT}"

echo "wrote ${OUT}"
