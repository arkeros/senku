load("//oci:vex.bzl", "vex_document", "vex_statement")

# CycloneDX SBOMs for the base images senku pulls rather than builds.
#
# Each is the `cyclonedx` attestation published against the exact digest pinned
# in //bazel/include:oci.MODULE.bazel, fetched and signature-verified once with
# `./oci/base_images/refresh.sh` and checked in from there.
#
# Checked in rather than fetched at build time on purpose: a base is pinned by
# digest, so its SBOM is immutable for that pin, and keeping it in the tree
# makes a base bump show its package delta in review instead of hiding it
# behind a digest change. It also keeps the build hermetic.
exports_files(glob(["*.cdx.json"]))

# Known-false-positive suppressions for the pulled base, mirroring the
# justification github.com/arkeros/distroless publishes for the same image.
#
# It lives here, once, rather than in each app: a false positive is a property
# of the base, so every image built on it needs exactly the same statement.
# `frontend_image` attaches this automatically.
#
# Refresh with the SBOM whenever the base digest moves — and delete any
# statement the new base no longer needs. `_cve_test_stale_vex` fails on a
# statement that matches nothing, which is what stops these outliving the
# finding they explain.
vex_document(
    name = "nginx_stable_vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/base_images/BUILD",
    statements = [
        # Heap buffer overflow when a `map` directive uses regex matching and a
        # string expression references the map's capture variables before the
        # map output variable. nginx.org's advisory lists 1.30.4+ as not
        # vulnerable and the base pins 1.30.4-1~trixie, which carries the fix.
        # Debian fixed its own nginx package in 1.30.4-3, and dpkg orders
        # `1.30.4-1~trixie` below `1.30.4-3` (`~` sorts before end-of-string),
        # so grype still matches.
        vex_statement(
            expires = "2026-09-15",
            impact_statement = "The .deb in the base is nginx.org's 1.30.4-1~trixie, listed not-vulnerable in https://nginx.org/en/security_advisories.html. The match comes from Debian's tracker entry for Debian's own nginx source package (fixed in 1.30.4-3), which grype selects because the purl carries no vendor namespace.",
            products = ["pkg:deb/debian/nginx"],
            status = "fixed",
            vulnerability = "CVE-2026-42533",
        ),
    ],
    timestamp = "2026-09-02T00:00:00Z",
    visibility = ["//visibility:public"],
)
