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
set -o errexit -o nounset -o pipefail

NAME="${1:?usage: refresh.sh <name> <image@digest>}"
REF="${2:?usage: refresh.sh <name> <image@digest>}"
DIR="$(dirname "$0")"
REPO="${REF%@*}"

bazel build --remote_download_outputs=all \
    //bazel/toolchains/cosign:compiled_cosign_toolchain \
    @com_github_google_go_containerregistry_cmd_krane//:krane
COSIGN="$(realpath "$(bazel cquery //bazel/toolchains/cosign:compiled_cosign_toolchain --output=files)")"
CRANE="$(realpath "$(bazel cquery @com_github_google_go_containerregistry_cmd_krane//:krane --output=files)")"

# Verified, not merely downloaded: an unverified SBOM is a document that looks
# like evidence. The identity is the workflow that publishes Chainguard's free
# images; a signature from anywhere else is rejected.
IDENTITY='https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main'

"${CRANE}" manifest "${REF}" \
  | python3 -c '
import json, sys
for m in json.load(sys.stdin)["manifests"]:
    p = m.get("platform") or {}
    if p.get("os") == "linux" and p.get("architecture") in ("amd64", "arm64"):
        print(p["architecture"], m["digest"])
' | while read -r ARCH DIGEST; do
    OUT="${DIR}/${NAME}.${ARCH}.cdx.json"
    "${COSIGN}" verify-attestation \
        --type=spdxjson \
        --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
        --certificate-identity="${IDENTITY}" \
        "${REPO}@${DIGEST}" \
      | python3 -c '
import base64, json, re, sys
# The attestation is SPDX; the pipeline merges CycloneDX. Convert the part
# that matters — the packages — and nothing else:
#  - only pkg:apk/ entries. The pkg:generic / pkg:github ones are melange
#    source provenance for those same packages, not additional software.
#  - each apk appears twice, with distro= and origin= qualifiers. Keep the
#    distro=wolfi form, which is what routes grype to the Wolfi secdb.
env = [l for l in sys.stdin.read().splitlines() if l.strip().startswith("{")][0]
pred = json.loads(base64.b64decode(json.loads(env)["payload"]))["predicate"]
seen, comps = set(), []
for p in pred["packages"]:
    for r in p.get("externalRefs", []):
        u = r.get("referenceLocator", "")
        if not u.startswith("pkg:apk/") or "distro=wolfi" not in u:
            continue
        m = re.match(r"pkg:apk/wolfi/([^@]+)@([^?]+)", u)
        key = m.group(1) + "@" + m.group(2)
        if key in seen:
            continue
        seen.add(key)
        comps.append({"type": "library", "name": m.group(1), "version": m.group(2), "purl": u})
comps.sort(key=lambda c: c["purl"])
json.dump({"bomFormat": "CycloneDX", "specVersion": "1.6", "version": 1, "components": comps}, sys.stdout, indent=2)
print()
' > "${OUT}"
    echo "wrote ${OUT}"
done
