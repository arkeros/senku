load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_apk//apk:defs.bzl", "apkdb_merge")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_rpm//rpm:defs.bzl", "rpmdb_merge")
load("@tar.bzl", "tar")
load("//oci:mirror_push.bzl", "mirror_push")
load("//oci:vex.bzl", "vex_document", "vex_statement")
load("//oci/distroless:matrix.bzl", "distroless_matrix")
load("//oci/distroless:platforms.bzl", "HUMMINGBIRD_ARCH_MAP", "WOLFI_ARCH_MAP")
load("//oci/distroless/common:debian_fixed_vex.bzl", "BUSYBOX_FIXED_VEX_STATEMENTS", "GLIBC_FIXED_VEX_STATEMENTS", "NCURSES_FIXED_VEX_STATEMENTS")
load("//oci/distroless/common:variables.bzl", "BUSYBOX_WONTFIX_CVES", "COMPRESSION", "DEBIAN_WONTFIX_CVES", "DEBUG_MODE", "DEFAULT_DEBUG_ENV", "DEFAULT_ENV")
load(":config.bzl", "BASH_ARCHITECTURES", "BASH_DISTROS", "bash_layers")

package(default_visibility = ["//visibility:public"])

# rust-coreutils 0.8.0-1 carries three unfixed Highs in Debian sid:
# mkfifo (CVE-2026-35341), mkdir TOCTOU (CVE-2026-35352), chroot
# (CVE-2026-35368). The rust-coreutils multicall binary contains all
# subcommands, but our images only expose the symlinks enumerated in
# //oci/distroless/common:BUILD's COREUTILS_COMMANDS. mkfifo and chroot
# were never in that set; mkdir was removed alongside this VEX. None
# of the three subcommands is resolvable by name on PATH — invoking
# them requires the non-standard `/bin/coreutils <name>` multicall
# form, which neither the entrypoint nor any layered tooling uses.
# Drops the moment Debian ships a fix (`_cve_test_stale_vex` will
# turn red and force deletion).
RUST_COREUTILS_VEX_STATEMENTS = [
    vex_statement(
        expires = "2026-08-11",
        impact_statement = "mkfifo is not in COREUTILS_COMMANDS — no /usr/bin/mkfifo symlink to the rust-coreutils multicall.",
        justification = "vulnerable_code_not_in_execute_path",
        products = ["pkg:oci/bash"],
        status = "not_affected",
        vulnerability = "CVE-2026-35341",
    ),
    vex_statement(
        expires = "2026-08-11",
        impact_statement = "mkdir was removed from COREUTILS_COMMANDS. Debug variants resolve mkdir to /busybox/mkdir (different implementation, not affected); non-debug variants don't expose mkdir on PATH.",
        justification = "vulnerable_code_not_in_execute_path",
        products = ["pkg:oci/bash"],
        status = "not_affected",
        vulnerability = "CVE-2026-35352",
    ),
    vex_statement(
        expires = "2026-08-11",
        impact_statement = "chroot is not in COREUTILS_COMMANDS — no /usr/bin/chroot symlink to the rust-coreutils multicall.",
        justification = "vulnerable_code_not_in_execute_path",
        products = ["pkg:oci/bash"],
        status = "not_affected",
        vulnerability = "CVE-2026-35368",
    ),
]

vex_document(
    name = "vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD",
    statements = GLIBC_FIXED_VEX_STATEMENTS + NCURSES_FIXED_VEX_STATEMENTS + RUST_COREUTILS_VEX_STATEMENTS,
    timestamp = "2026-05-13T00:00:00Z",
)

vex_document(
    name = "debug_vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD#debug",
    statements = BUSYBOX_FIXED_VEX_STATEMENTS + RUST_COREUTILS_VEX_STATEMENTS,
    timestamp = "2026-05-13T00:00:00Z",
)

# Hummingbird uses regular coreutils (no libsystemd0 split like Debian, so
# no rust-coreutils workaround needed) and ships /usr/bin/sh directly. No
# fixed-VEX statements yet — same posture as static/cc on hummingbird.
vex_document(
    name = "vex_hummingbird",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD#hummingbird",
    statements = [],
    timestamp = "2026-05-15T00:00:00Z",
)

# Wolfi ships regular coreutils (no libsystemd0 split, no rust-coreutils
# workaround needed) and `gawk` as the awk implementation (no `mawk`
# on wolfi). Empty VEX until the scanner DB surfaces something concrete.
vex_document(
    name = "vex_wolfi",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD#wolfi",
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

# Wolfi has no honest single repo-revision anchor in APKINDEX — omit
# `created` per ADR 0007 "missing > misleading".
_CREATED = {
    "debian": "//oci/distroless/common:created_debian",
    "hummingbird": "//oci/distroless/common:created_hummingbird",
    "wolfi": None,
}

[
    distroless_matrix(
        name = "bash",
        architectures = BASH_ARCHITECTURES[distro],
        created = _CREATED[distro],
        debug_env = DEFAULT_DEBUG_ENV,
        debug_ignore_cves = BUSYBOX_WONTFIX_CVES if distro == "debian" else [],
        debug_index_annotations = {
            "org.opencontainers.image.description": "Distroless bash image (debug)",
            "org.opencontainers.image.source": "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD",
        },
        debug_layers = bash_layers,
        debug_vex = [":debug_vex"] if distro == "debian" else [],
        distro = distro,
        entrypoint = ["/usr/bin/bash"],
        env = DEFAULT_ENV,
        ignore_cves = _IGNORE_CVES[distro],
        index_annotations = {
            "org.opencontainers.image.description": "Distroless bash image",
            "org.opencontainers.image.source": "https://github.com/arkeros/senku/blob/main/oci/distroless/bash/BUILD",
        },
        layers = bash_layers,
        vex = _VEX[distro],
    )
    for distro in BASH_DISTROS
]

# Debian bash layer: rust-coreutils + symlinks (to avoid libsystemd0).
[
    flatten(
        name = arch + "_debian_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@debian//{}/{}".format("bash", arch),
            # for runfiles we need: env, sed, grep & awk
            # rust-coreutils provides /usr/bin/env without libsystemd0 dependency
            "@debian//{}/{}".format("rust-coreutils", arch),
            "//oci/distroless/common:coreutils_links",
            "@debian//{}/{}".format("sed", arch),
            "@debian//{}/{}".format("grep", arch),
            "@debian//{}/{}".format("mawk", arch),
            "//oci/distroless/common:awk",
        ],
    )
    for arch in BASH_ARCHITECTURES["debian"]
]

# Hummingbird bash layer: regular coreutils, no libsystemd0 split on RHEL
# so the rust-coreutils workaround isn't needed. /usr/bin/awk symlink is
# reused from common — Debian and Hummingbird both ship mawk at the same
# canonical path after rpm-extract's UsrMerge rewrite.
[
    flatten(
        name = arch + "_hummingbird_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@hummingbird//bash/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//coreutils/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//sed/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//grep/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//mawk/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            # Soname deps of the binaries above. All transitively in the
            # lockfile (pin walks rpm:requires) but flatten only ships
            # what's listed here, same posture as @debian's image composition:
            #   bash       -> libtinfo.so.6   (ncurses-libs)
            #   grep       -> libpcre2-8.so.0 (pcre2)
            #   sed        -> libselinux.so.1 (libselinux) -> libpcre2 + libsepol
            #              -> libattr.so.1   (libattr)
            #   coreutils  -> libselinux + libcap.so.2 (libcap) + libacl.so.1
            #                (libacl) -> libattr
            "@hummingbird//libacl/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//libattr/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//libcap/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//libselinux/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//libsepol/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//ncurses-libs/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "@hummingbird//pcre2/{}".format(HUMMINGBIRD_ARCH_MAP[arch]),
            "//oci/distroless/common:awk",
        ],
    )
    for arch in BASH_ARCHITECTURES["hummingbird"]
]

# rpmdb tars per (mode, arch). Aspect-walks static + cc + bash flattens
# (plus busybox on debug); single sqlite is the only rpmdb in the
# composed image (no inheritance, no dead layers).
[
    rpmdb_merge(
        name = "rpmdb_bash{}_{}_hummingbird".format(mode, arch),
        targets = [
            "//oci/distroless/static:static_{}_hummingbird_layer".format(arch),
        ] + ([
            "//oci/distroless/static:busybox_{}_hummingbird_layer".format(arch),
        ] if mode == "_debug" else []) + [
            "//oci/distroless/cc:cc_{}_hummingbird_layer".format(arch),
            ":" + arch + "_hummingbird_layer",
        ],
    )
    for mode in [
        "",
        "_debug",
    ]
    for arch in BASH_ARCHITECTURES["hummingbird"]
]

# Wolfi bash layer: same shape as hummingbird, mapped to wolfi names.
# Soname deps inline alongside the binaries — same posture as
# hummingbird's flatten so the closure is honest about what each
# binary links against.
#
#   bash       → bash               → libtinfo.so.6 (ncurses)
#   coreutils  → coreutils          → libacl.so.1 (libacl1), libattr.so.1 (libattr1),
#                                     libcrypto.so.3 (libcrypto3 already in cc)
#   grep       → grep               → libpcre2-8.so.0 (pcre2 split: libpcre2-8-0)
#   sed        → sed
#   awk        → gawk               (wolfi has no mawk; gawk is the POSIX
#                                    analog and identical for distroless scripts)
#   mailcap    → mailcap            (/etc/mime.types, /etc/mailcap)
#
# `:awk` is the `usr/bin/awk -> /usr/bin/gawk` symlink (replaces the
# `awk → mawk` link the debian/hummingbird stacks use; same file, new
# target).
[
    flatten(
        name = arch + "_wolfi_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@wolfi//bash/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//coreutils/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//sed/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//grep/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//gawk/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//mailcap/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libacl1/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libattr1/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libcap/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libselinux/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//libsepol/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//ncurses/" + WOLFI_ARCH_MAP[arch],
            "@wolfi//pcre2/" + WOLFI_ARCH_MAP[arch],
            ":awk_wolfi_symlink",
        ],
    )
    for arch in BASH_ARCHITECTURES["wolfi"]
]

# /usr/bin/awk -> /usr/bin/gawk on wolfi. The common :awk target
# points at /usr/bin/mawk which wolfi doesn't ship; rebuild the
# symlink locally with the right target rather than parameterising
# the common one (avoids leaking wolfi's awk-flavor preference into
# the rest of the tree).
tar(
    name = "awk_wolfi_symlink",
    mtree = [
        "./usr/bin/awk type=link link=/usr/bin/gawk",
    ],
)

# Wolfi apkdbs per (mode, arch): static + cc + bash flattens (plus
# busybox on debug).
[
    apkdb_merge(
        name = "apkdb_bash{}_{}_wolfi".format(mode, arch),
        srcs = [
            "//oci/distroless/static:static_{}_wolfi_layer".format(arch),
        ] + ([
            "//oci/distroless/static:busybox_{}_wolfi_layer".format(arch),
        ] if mode == "_debug" else []) + [
            "//oci/distroless/cc:cc_{}_wolfi_layer".format(arch),
            ":" + arch + "_wolfi_layer",
        ],
    )
    for mode in [
        "",
        "_debug",
    ]
    for arch in BASH_ARCHITECTURES["wolfi"]
]

[
    mirror_push(
        name = "bash" + mode,
        image = ":bash" + mode + "_nonroot_debian",
        repository = "bash",
        sbom = ":bash" + mode + "_nonroot_debian_sbom",
        tag_list = [
            "debug" if mode else "latest",
            "{{.STABLE_MONOREPO_IMAGE_TAG_VERSION}}" + mode.replace("_", "-"),
            "{{.STABLE_MONOREPO_SHORT_VERSION}}" + mode.replace("_", "-"),
        ],
        tags = ["manual"],
    )
    for mode in DEBUG_MODE
]

container_structure_test(
    name = "bash_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "docker",
    exec_properties = {
        "test.workload-isolation-type": "firecracker",
        "test.init-dockerd": "true",
    },
    image = ":bash_nonroot_amd64_debian.oci_layout",
    tags = ["requires-docker"],
)

container_structure_test(
    name = "bash_wolfi_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "docker",
    exec_properties = {
        "test.workload-isolation-type": "firecracker",
        "test.init-dockerd": "true",
    },
    image = ":bash_nonroot_amd64_wolfi.oci_layout",
    tags = ["requires-docker"],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
