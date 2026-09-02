# CycloneDX SBOMs for the base images senku pulls rather than builds, one per
# architecture.
#
# Each is converted from the SPDX attestation the publisher signs against the
# per-arch manifest digest under the index pinned in
# //bazel/include:oci.MODULE.bazel, fetched and signature-verified with
# `./oci/base_images/refresh.sh` and checked in from there.
#
# Checked in rather than fetched at build time on purpose: a base is pinned by
# digest, so its SBOM is immutable for that pin, and keeping it in the tree
# makes a base bump show its package delta in review instead of hiding it
# behind a digest change. It also keeps the build hermetic.
exports_files(glob(["*.cdx.json"]))
