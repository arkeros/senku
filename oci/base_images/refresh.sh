#!/usr/bin/env bash
# Refresh the checked-in SBOMs for a pulled base image from its published
# attestations, one file per architecture.
#
# Run this whenever the digest pinned in //bazel/include:oci.MODULE.bazel
# changes. The diff is the point: it shows exactly which packages the new base
# adds, drops or bumps, which a digest change on its own does not.
#
#   ./oci/base_images/refresh.sh chainguard_nginx \
#       cgr.dev/chainguard/nginx@sha256:<index digest>
#
# Chainguard attaches package SBOMs to each per-architecture manifest, not to
# the index (the index's own attestation lists only the manifests), so this
# walks the index and fetches one attestation per platform.
#
# Every tool comes from Bazel — cosign, crane and jq alike — so the script has
# no host dependencies beyond bash and the workspace.
set -o errexit -o nounset -o pipefail

NAME="${1:?usage: refresh.sh <name> <image@digest>}"
REF="${2:?usage: refresh.sh <name> <image@digest>}"
DIR="$(dirname "$0")"
REPO="${REF%@*}"

bazel build --remote_download_outputs=all \
    //bazel/toolchains/cosign:compiled_cosign_toolchain \
    @com_github_google_go_containerregistry_cmd_krane//:krane \
    @jq_toolchains//:resolved_toolchain
EXECROOT="$(bazel info execution_root)"
tool() { echo "${EXECROOT}/$(bazel cquery "$1" --output=files)"; }
COSIGN="$(tool //bazel/toolchains/cosign:compiled_cosign_toolchain)"
CRANE="$(tool @com_github_google_go_containerregistry_cmd_krane//:krane)"
JQ="$(tool @jq_toolchains//:resolved_toolchain)"

# Verified, not merely downloaded: an unverified SBOM is a document that looks
# like evidence. The identity is the workflow that publishes Chainguard's free
# images; a signature from anywhere else is rejected.
IDENTITY='https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main'

# The attestation is SPDX; the pipeline merges CycloneDX. Convert the part that
# matters — the packages — and nothing else:
#  - only pkg:apk/ entries. The pkg:generic / pkg:github ones are melange's
#    source provenance for those same packages, not additional software.
#  - each apk appears twice, with distro= and origin= qualifiers. Keep the
#    distro=wolfi form, which is what routes grype to the Wolfi secdb.
CONVERT='
  .payload | @base64d | fromjson | .predicate.packages
  | [ .[].externalRefs[]? | select(.referenceType == "purl") | .referenceLocator
      | select(startswith("pkg:apk/") and contains("distro=wolfi"))
      | capture("^pkg:apk/wolfi/(?<name>[^@]+)@(?<version>[^?]+)") + {purl: .}
    ]
  | unique_by(.name, .version)
  | sort_by(.purl)
  | map({type: "library", name, version, purl})
  | {bomFormat: "CycloneDX", specVersion: "1.6", version: 1, components: .}
'

"${CRANE}" manifest "${REF}" \
  | "${JQ}" -r '.manifests[] | select(.platform.os == "linux" and (.platform.architecture | IN("amd64", "arm64")))
                | "\(.platform.architecture) \(.digest)"' \
  | while read -r ARCH DIGEST; do
    OUT="${DIR}/${NAME}.${ARCH}.cdx.json"
    "${COSIGN}" verify-attestation \
        --type=spdxjson \
        --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
        --certificate-identity="${IDENTITY}" \
        "${REPO}@${DIGEST}" \
      | "${JQ}" --indent 2 "${CONVERT}" > "${OUT}"
    echo "wrote ${OUT}"
done
