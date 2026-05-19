load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_apk//apk:defs.bzl", "apkdb_merge")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_rpm//rpm:defs.bzl", "rpmdb_merge")
load("//oci:vex.bzl", "vex_document")
load("//oci/distroless:matrix.bzl", "distroless_matrix")
load("//oci/distroless:platforms.bzl", "HUMMINGBIRD_ARCH_MAP", "WOLFI_ARCH_MAP", BUSYBOX_ARCHITECTURES = "ALL_ARCHITECTURES")
load("//oci/distroless/common:debian_fixed_vex.bzl", "BUSYBOX_FIXED_VEX_STATEMENTS", "GLIBC_FIXED_VEX_STATEMENTS")
load("//oci/distroless/common:variables.bzl", "BUSYBOX_WONTFIX_CVES", "COMPRESSION", "DEBIAN_WONTFIX_CVES", "DEBUG_MODE")
load(":busybox.bzl", "busybox_layer")
load(":config.bzl", "STATIC_ARCHITECTURES", "STATIC_DISTROS", "static_debug_layers", "static_layers")

package(default_visibility = ["//visibility:public"])

vex_document(
    name = "vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/static/BUILD",
    statements = GLIBC_FIXED_VEX_STATEMENTS,
    timestamp = "2026-05-01T00:00:00Z",
)

vex_document(
    name = "debug_vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/static/BUILD#debug",
    statements = BUSYBOX_FIXED_VEX_STATEMENTS,
    timestamp = "2026-05-01T00:00:00Z",
)

# Hummingbird: no fixed-VEX statements yet (ADR 0007's competitive thesis is
# real-zero on these packages, not VEX-suppressed). Empty document is a
# placeholder so the matrix can pass `vex` per-distro uniformly.
vex_document(
    name = "vex_hummingbird",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/static/BUILD#hummingbird",
    statements = [],
    timestamp = "2026-05-15T00:00:00Z",
)

# Wolfi: also empty for now — wolfi-baselayout / ca-certificates-bundle
# / tzdata have no open advisories against the secdb provider as of the
# current snapshot. Wolfi's continuous-rebuild model keeps the wontfix
# list near zero structurally; revisit if a glibc-bearing wolfi image
# accumulates one.
vex_document(
    name = "vex_wolfi",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/static/BUILD#wolfi",
    statements = [],
    timestamp = "2026-05-19T00:00:00Z",
)

# Per-distro CVE allow-list and VEX. Each invocation of distroless_matrix
# below selects the right pair via _IGNORE_CVES[distro] / _VEX[distro].
# Hummingbird's and wolfi's `tzdata`/`ca-certificates`/`mailcap` carry no
# published CVEs, so both lists are empty; revisit once glibc-bearing
# images migrate.
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

# Per-distro `created` timestamp source. Wolfi's APKINDEX exposes
# per-package build times but no single repo-revision anchor; per ADR
# 0007's "missing data > misleading data" principle, omit the field
# until we have an honest snapshot signal (#TODO open: aggregate
# max(t:) across the closure, or wait for chainguard's snapshot
# service). The matrix accepts `created = None`.
_CREATED = {
    "debian": "//oci/distroless/common:created_debian",
    "hummingbird": "//oci/distroless/common:created_hummingbird",
    "wolfi": None,
}

_DEFAULT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Debian flatten: per-arch label shape (`@debian//tzdata/amd64`). Uses the
# senku `cacerts_<distro>_<arch>` extraction since Debian's ca-certificates
# package needs path normalisation.
[
    flatten(
        name = "static_" + arch + "_debian_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@debian//{}/{}".format("base-files", arch),
            "@debian//{}/{}".format("netbase", arch),
            "@debian//{}/{}".format("tzdata", arch),
            "@debian//{}/{}".format("media-types", arch),
            "//oci/distroless/common:rootfs",
            "//oci/distroless/common:passwd",
            "//oci/distroless/common:home",
            "//oci/distroless/common:group",
            "//oci/distroless/common:tmp",
            "//oci/distroless/common:os_release_debian",
            "//oci/distroless/common:cacerts_debian_" + arch,
        ],
    )
    for arch in STATIC_ARCHITECTURES["debian"]
]

# Hummingbird flatten: ADR 0007's static composition. Three Hummingbird
# packages (tzdata, ca-certificates, mailcap — all noarch) + the senku-
# synthesized rootfs/passwd/home/group/tmp + ID=hummingbird os-release.
# No senku-side `cacerts` extractor needed: Hummingbird's ca-certificates
# rpm already ships /etc/ssl/certs/ca-certificates.crt as a Debian-compat
# symlink alongside its native /etc/pki/ca-trust layout, so the existing
# SSL_CERT_FILE env in the matrix call resolves correctly.
[
    flatten(
        name = "static_" + arch + "_hummingbird_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@hummingbird//ca-certificates/noarch",
            "@hummingbird//mailcap/noarch",
            "@hummingbird//tzdata/noarch",
            "//oci/distroless/common:rootfs",
            "//oci/distroless/common:passwd",
            "//oci/distroless/common:home",
            "//oci/distroless/common:group",
            "//oci/distroless/common:tmp",
            "//oci/distroless/common:os_release_hummingbird",
            "//oci/distroless/common:etc_os_release_symlink",
            "//oci/distroless/common:usrmerge_symlinks_hummingbird",
        ],
    )
    for arch in STATIC_ARCHITECTURES["hummingbird"]
]

# rpmdb tars per (mode, arch). Aspect-driven — `targets` walks each
# flatten's `tars` and collects RpmHeaderInfo from every rpm_package
# reachable. Release lists only the static layer; debug also lists
# busybox so its CVEs route through the hummingbird secdb provider
# (which knows the hum1 backports) rather than NVD-generic via the
# binary cataloger. rpmdb_merge dedupes by (package, arch), so
# re-using the release flatten as a target doesn't duplicate rows
# and the debug package set never falls out of sync with what the
# release image actually ships.
[
    rpmdb_merge(
        name = "rpmdb{}_{}_hummingbird".format(mode, arch),
        targets = [":static_{}_hummingbird_layer".format(arch)] + (
            [":busybox_{}_hummingbird_layer".format(arch)] if mode == "_debug" else []
        ),
    )
    for mode in DEBUG_MODE
    for arch in STATIC_ARCHITECTURES["hummingbird"]
]

# Wolfi flatten — wolfi-baselayout provides /etc/passwd, /etc/group,
# /etc/shadow, /etc/os-release, and the standard FHS-style rootfs
# directory tree. The apt-side `cacerts_<distro>_<arch>` extractor
# isn't needed because wolfi's ca-certificates-bundle ships
# /etc/ssl/certs/ca-certificates.crt at the conventional path.
#
# Wolfi labels even nominally-noarch packages (tzdata, wolfi-baselayout)
# as arch-specific in APKINDEX, so all spoke paths use the apk-native
# arch name (x86_64 / aarch64) via WOLFI_ARCH_MAP. The lockfile-driven
# shape matches: `noarch` keys never appear for the wolfi closure as
# of this snapshot.
[
    flatten(
        name = "static_" + arch + "_wolfi_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@wolfi//wolfi-baselayout/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//ca-certificates-bundle/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//tzdata/" + WOLFI_ARCH_MAP[arch],
            "//oci/distroless/common:rootfs",
            "//oci/distroless/common:tmp",
            "//oci/distroless/common:os_release_wolfi",
            "//oci/distroless/common:etc_os_release_symlink",
        ],
    )
    for arch in STATIC_ARCHITECTURES["wolfi"]
]

# /lib/apk/db/installed tars per (mode, arch). Same fan-in shape as
# the hummingbird rpmdb above — gather_apk_fragments aspect walks
# each flatten's `tars` and collects ApkFragmentInfo from every
# apk_package reachable. Release lists only the static layer; debug
# adds busybox.
[
    apkdb_merge(
        name = "apkdb{}_{}_wolfi".format(mode, arch),
        srcs = [":static_{}_wolfi_layer".format(arch)] + (
            [":busybox_{}_wolfi_layer".format(arch)] if mode == "_debug" else []
        ),
    )
    for mode in DEBUG_MODE
    for arch in STATIC_ARCHITECTURES["wolfi"]
]

[
    distroless_matrix(
        name = "static",
        architectures = STATIC_ARCHITECTURES[distro],
        # RFC 3339 `created` from the per-distro upstream-snapshot anchor;
        # see //oci:created_timestamp.bzl + ADR 0007 §"Build horizon".
        # Wolfi has no honest single anchor today, so _CREATED[distro] is
        # None and the field is omitted from the image config.
        created = _CREATED[distro],
        debug_entrypoint = ["/busybox/sh"],
        debug_env = {"PATH": _DEFAULT_PATH + ":/busybox"},
        debug_ignore_cves = BUSYBOX_WONTFIX_CVES if distro == "debian" else [],
        debug_layers = static_debug_layers,
        # Hummingbird debug carries no extra fixed-VEX yet (busybox CVEs
        # come from the hummingbird secdb provider, not via NVD-CPE).
        # Wolfi same: its continuous-rebuild model keeps busybox-CVE drift
        # to a minimum; revisit if the scanner surfaces something.
        debug_vex = [":debug_vex"] if distro == "debian" else [],
        distro = distro,
        env = {
            "PATH": _DEFAULT_PATH,
            "SSL_CERT_FILE": "/etc/ssl/certs/ca-certificates.crt",
        },
        ignore_cves = _IGNORE_CVES[distro],
        layers = static_layers,
        vex = _VEX[distro],
    )
    for distro in STATIC_DISTROS
]

# Per-distro busybox source. Debian calls the package `busybox-static`
# and uses senku-native arch names (amd64/arm64); hummingbird and wolfi
# both call it `busybox` and use the rpm/apk arch convention
# (x86_64/aarch64). The /busybox/<cmd> symlink macro in busybox.bzl
# points at /usr/bin/busybox uniformly — verified that all three repos
# ship the binary at that path, so no per-distro symlink-target
# divergence.
_BUSYBOX_SOURCES = {
    "debian": (
        "busybox-static",
        {arch: arch for arch in BUSYBOX_ARCHITECTURES},
    ),
    "hummingbird": ("busybox", HUMMINGBIRD_ARCH_MAP),
    "wolfi": ("busybox", WOLFI_ARCH_MAP),
}

[
    busybox_layer(
        name = "busybox_{}_{}_layer".format(arch, distro),
        busybox = "@{}//{}/{}".format(
            distro,
            pkg,
            arch_map[arch],
        ),
        compress = COMPRESSION,
    )
    for distro, (pkg, arch_map) in _BUSYBOX_SOURCES.items()
    for arch in BUSYBOX_ARCHITECTURES
]

# Structure tests (amd64 only, tar driver doesn't need docker).
# Two yaml configs per test: `test_<distro>.yaml` carries the distro-
# specific assertions (Debian-shape /usr/share paths; RHEL /usr/lib64
# + rpmdb sqlite for hummingbird; flat /usr/lib + /usr/bin/ld.so +
# /lib/apk/db/installed for wolfi). `test_<user>.yaml` carries the
# user/workdir/PATH assertions, which are distro-agnostic.
[
    container_structure_test(
        name = "static_{}_{}_test".format(user, distro),
        size = "small",
        configs = [
            "test_{}.yaml".format(distro),
            "test_{}.yaml".format(user),
        ],
        driver = "tar",
        image = ":static_{}_amd64_{}.tar".format(user, distro),
    )
    for distro in STATIC_DISTROS
    for user in [
        "root",
        "nonroot",
    ]
]

container_structure_test(
    name = "static_debug_test",
    size = "small",
    configs = [
        "test_debian.yaml",
        "test_debug.yaml",
    ],
    driver = "docker",
    exec_properties = {
        "test.workload-isolation-type": "firecracker",
        "test.init-dockerd": "true",
    },
    image = ":static_debug_nonroot_amd64_debian.oci_layout",
    tags = ["requires-docker"],
)

bzl_library(
    name = "busybox",
    srcs = ["busybox.bzl"],
    deps = [
        "//oci/distroless/common:variables",
        "@rules_distroless//distroless:defs",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
