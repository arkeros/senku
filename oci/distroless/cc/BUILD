load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_apk//apk:defs.bzl", "apkdb_merge")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_rpm//rpm:defs.bzl", "rpmdb_merge")
load("//oci:vex.bzl", "vex_document")
load("//oci/distroless:matrix.bzl", "distroless_matrix")
load("//oci/distroless:platforms.bzl", "HUMMINGBIRD_ARCH_MAP", "WOLFI_ARCH_MAP")
load("//oci/distroless/common:debian_fixed_vex.bzl", "BUSYBOX_FIXED_VEX_STATEMENTS", "GLIBC_FIXED_VEX_STATEMENTS")
load("//oci/distroless/common:variables.bzl", "BUSYBOX_WONTFIX_CVES", "COMPRESSION", "DEBIAN_WONTFIX_CVES", "DEBUG_MODE", "DEFAULT_DEBUG_ENV", "DEFAULT_ENV")
load(":config.bzl", "CC_ARCHITECTURES", "CC_DISTROS", "cc_layers")

package(default_visibility = ["//visibility:public"])

vex_document(
    name = "vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/cc/BUILD",
    statements = GLIBC_FIXED_VEX_STATEMENTS,
    timestamp = "2026-05-01T00:00:00Z",
)

vex_document(
    name = "debug_vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/cc/BUILD#debug",
    statements = BUSYBOX_FIXED_VEX_STATEMENTS,
    timestamp = "2026-05-01T00:00:00Z",
)

# Hummingbird: ADR 0007's whole point on cc is real-zero on glibc-2.42-13.hum1
# (CVE-2026-5435/5450/5928 backported by Hummingbird). Empty document is a
# placeholder so the matrix can pass `vex` per-distro uniformly — populate
# only if the scanner DB ever surfaces a CVE we need to suppress, which
# would defeat the ADR's thesis and warrant a louder response than VEX.
vex_document(
    name = "vex_hummingbird",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/cc/BUILD#hummingbird",
    statements = [],
    timestamp = "2026-05-15T00:00:00Z",
)

# Wolfi: same posture as hummingbird — empty until the scanner DB
# surfaces something on the glibc/libstdc++/openssl/zlib closure that
# would warrant VEX. Wolfi's continuous-rebuild keeps the wontfix list
# at zero structurally.
vex_document(
    name = "vex_wolfi",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/cc/BUILD#wolfi",
    statements = [],
    timestamp = "2026-05-19T00:00:00Z",
)

_IGNORE_CVES = {
    "debian": DEBIAN_WONTFIX_CVES,
    "hummingbird": [],
    "wolfi": [],
}

_VEX = {
    "debian": [":vex"],
    "hummingbird": [":vex_hummingbird"],
    "wolfi": [":vex_wolfi"],
}

# Per-distro `created` source. Wolfi has no single repo-revision
# anchor in its APKINDEX — omit the field rather than synthesize a
# misleading timestamp (ADR 0007 "missing > misleading").
_CREATED = {
    "debian": "//oci/distroless/common:created_debian",
    "hummingbird": "//oci/distroless/common:created_hummingbird",
    "wolfi": None,
}

# Debian cc layer: libc6 + libssl3t64 + libstdc++6. Closure refs (not `:data`)
# preserve `PackageMetadataInfo` for SBOM — alias targets don't propagate
# `applicable_licenses` through the gather_metadata aspect.
[
    flatten(
        name = "cc_{}_debian_layer".format(arch),
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@debian//libc6/{}".format(arch),
            "@debian//libssl3t64/{}".format(arch),
            "@debian//libstdc++6/{}".format(arch),
        ],
    )
    for arch in CC_ARCHITECTURES["debian"]
]

# Hummingbird cc layer: RHEL-shape mapping of the Debian set —
#   libc6        → glibc (+ glibc-common for locale data referenced by glibc
#                  scripts and tzdata's POSIX TZ lookups)
#   libstdc++6   → libstdc++ (+ libgcc; libstdc++.so.6 dynlinks libgcc_s.so.1)
#   libssl3t64   → openssl-libs (libssl.so.3 + libcrypto.so.3)
# glibc-2.42-13.hum1 is the version Red Hat's CVE API names as carrying
# backports for CVE-2026-5435/5450/5928 — the three glibc CVEs Debian sid
# still has on its wontfix list. This layer is the proof point for ADR 0007.
[
    flatten(
        name = "cc_" + arch + "_hummingbird_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@hummingbird//glibc/" + HUMMINGBIRD_ARCH_MAP[arch],
            "@hummingbird//glibc-common/" + HUMMINGBIRD_ARCH_MAP[arch],
            "@hummingbird//libgcc/" + HUMMINGBIRD_ARCH_MAP[arch],
            "@hummingbird//libstdc++/" + HUMMINGBIRD_ARCH_MAP[arch],
            "@hummingbird//openssl-libs/" + HUMMINGBIRD_ARCH_MAP[arch],
            "@hummingbird//zlib-ng-compat/" + HUMMINGBIRD_ARCH_MAP[arch],
        ],
    )
    for arch in CC_ARCHITECTURES["hummingbird"]
]

# Full-package rpmdb per (mode, arch) — single sqlite covering static's
# 3 noarch rows plus cc's 6 glibc-bearing additions (plus busybox on
# debug). Composition (no base inheritance) means this is the ONLY
# rpmdb in the cc image, saves ~1MB of duplicate rpmdb.sqlite layers
# vs the old base-inheritance model.
[
    rpmdb_merge(
        name = "rpmdb_cc{}_{}_hummingbird".format(mode, arch),
        targets = [
            "//oci/distroless/static:static_{}_hummingbird_layer".format(arch),
        ] + ([
            "//oci/distroless/static:busybox_{}_hummingbird_layer".format(arch),
        ] if mode == "_debug" else []) + [
            ":cc_{}_hummingbird_layer".format(arch),
        ],
    )
    for mode in DEBUG_MODE
    for arch in CC_ARCHITECTURES["hummingbird"]
]

# Wolfi cc layer: maps the same Debian set as hummingbird, with wolfi's
# package decomposition —
#   libc6        → glibc (+ ld-linux as a separate runtime stub; wolfi
#                  packages the dynamic linker outside glibc unlike
#                  hummingbird's monolithic glibc rpm)
#   libstdc++6   → libstdc++ (+ libgcc; libstdc++.so.6 dynlinks libgcc_s.so.1)
#   libssl3t64   → libcrypto3 + libssl3 (openssl runtime is split into
#                  two APKs on wolfi; the `openssl` CLI package is *not*
#                  included — distroless never invokes the CLI)
#   (zlib)       → zlib (separately required by node/nginx; included
#                  here so cc-on-wolfi parallels cc-on-hummingbird's
#                  zlib-ng-compat shape)
[
    flatten(
        name = "cc_" + arch + "_wolfi_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@wolfi//glibc/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libgcc/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libstdc++/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libcrypto3/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libssl3/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//zlib/" + WOLFI_ARCH_MAP[arch],
        ],
    )
    for arch in CC_ARCHITECTURES["wolfi"]
]

# Per-(mode, arch) apkdb for wolfi cc — gather_apk_fragments walks the
# static base, the busybox layer (debug only), and cc's own flatten
# so /lib/apk/db/installed lists every package reachable in the image.
[
    apkdb_merge(
        name = "apkdb_cc{}_{}_wolfi".format(mode, arch),
        srcs = [
            "//oci/distroless/static:static_{}_wolfi_layer".format(arch),
        ] + ([
            "//oci/distroless/static:busybox_{}_wolfi_layer".format(arch),
        ] if mode == "_debug" else []) + [
            ":cc_{}_wolfi_layer".format(arch),
        ],
    )
    for mode in DEBUG_MODE
    for arch in CC_ARCHITECTURES["wolfi"]
]

[
    distroless_matrix(
        name = "cc",
        architectures = CC_ARCHITECTURES[distro],
        created = _CREATED[distro],
        debug_entrypoint = ["/busybox/sh"],
        debug_env = DEFAULT_DEBUG_ENV,
        debug_ignore_cves = BUSYBOX_WONTFIX_CVES if distro == "debian" else [],
        debug_layers = cc_layers,
        debug_vex = [":debug_vex"] if distro == "debian" else [],
        distro = distro,
        env = DEFAULT_ENV,
        ignore_cves = _IGNORE_CVES[distro],
        layers = cc_layers,
        vex = _VEX[distro],
    )
    for distro in CC_DISTROS
]

container_structure_test(
    name = "cc_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "tar",
    image = ":cc_nonroot_amd64_debian.tar",
)

container_structure_test(
    name = "cc_hummingbird_test",
    size = "small",
    configs = ["test_hummingbird.yaml"],
    driver = "tar",
    image = ":cc_nonroot_amd64_hummingbird.tar",
)

container_structure_test(
    name = "cc_wolfi_test",
    size = "small",
    configs = ["test_wolfi.yaml"],
    driver = "tar",
    image = ":cc_nonroot_amd64_wolfi.tar",
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
