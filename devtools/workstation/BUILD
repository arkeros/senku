load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_img//img:image.bzl", "image_index")
load("@rules_img//img:push.bzl", "image_push")
load("@tar.bzl", "tar")
load("//oci:config.bzl", "OCI_REGISTRY", "OCI_REPOSITORY_PREFIX")
load("//oci:oci_image.bzl", "oci_image")
load("//oci/distroless:platforms.bzl", "ARCHITECTURE_PLATFORMS")
load("//oci/distroless/common:variables.bzl", "COMPRESSION", "DEBIAN_WONTFIX_CVES")
load(":config.bzl", "WORKSTATION_ARCHITECTURES", "WORKSTATION_PACKAGES")

package(default_visibility = ["//visibility:public"])

# Workstation-specific CVE allow-list. Threat model: developer-interactive
# VM running only code its operator chooses to run; not exposed to
# untrusted input on the affected components.
WORKSTATION_IGNORE_CVES = [
    # python3.13 — pulled transitively by `fish` for its runtime helpers.
    # The Python interpreter in this image is not invoked on
    # network-supplied data; it's a fish dependency.
    "CVE-2026-4786",
]

exports_files([
    "debian.yaml",
    "debian.lock.json",
])

# Vendored exe.dev systemd plumbing — services, sockets, init wrapper.
# These bytes flow into the image unchanged; their target paths in the
# layer are spelled out here rather than mirrored from `files/` so the
# layer contract is reviewable without recursing into the source tree.
tar(
    name = "files_layer",
    srcs = [
        "files/etc/group",
        "files/etc/passwd",
        "files/etc/shadow",
        "files/etc/sudoers.d/exedev",
        "files/etc/systemd/system/exe-setup.service",
        "files/etc/systemd/system/shelley.service",
        "files/etc/systemd/system/shelley.socket",
        "files/usr/local/bin/init",
    ],
    compress = COMPRESSION,
    mtree = [
        # User account database. Hand-rolled because rules_distroless
        # extracts .debs without running maintainer scripts — the usual
        # package-time passwd/group/shadow generation never happens.
        "./etc/passwd uid=0 gid=0 mode=0644 type=file content=$(execpath files/etc/passwd)",
        "./etc/group uid=0 gid=0 mode=0644 type=file content=$(execpath files/etc/group)",
        "./etc/shadow uid=0 gid=42 mode=0640 type=file content=$(execpath files/etc/shadow)",
        # exedev: passwordless sudo (drop-in, mode 0440 — sudo refuses
        # otherwise).
        "./etc/sudoers.d/exedev uid=0 gid=0 mode=0440 type=file content=$(execpath files/etc/sudoers.d/exedev)",
        # Home dir owned by the user. .bashrc / dotfiles get seeded later
        # (or by exe.dev's first-boot setup script).
        "./home type=dir uid=0 gid=0 mode=0755",
        "./home/exedev type=dir uid=1000 gid=1000 mode=0755",
        # exe.dev plumbing.
        "./etc/systemd/system/exe-setup.service uid=0 gid=0 mode=0644 type=file content=$(execpath files/etc/systemd/system/exe-setup.service)",
        "./etc/systemd/system/shelley.service uid=0 gid=0 mode=0644 type=file content=$(execpath files/etc/systemd/system/shelley.service)",
        "./etc/systemd/system/shelley.socket uid=0 gid=0 mode=0644 type=file content=$(execpath files/etc/systemd/system/shelley.socket)",
        "./usr/local/bin/init uid=0 gid=0 mode=0755 type=file content=$(execpath files/usr/local/bin/init)",
    ],
)

# systemd plumbing: enable shelley + exe-setup, mask units that don't
# make sense in a container, set the default target. Each line is a
# symlink in mtree syntax; no source files needed.
#
# Enables follow the convention systemctl uses: a wants-symlink under
# the target's *.wants/ directory pointing to the unit. Masks point to
# /dev/null so even an explicit `systemctl enable` becomes a no-op.
_MASKED_UNITS = [
    "console-getty.service",
    "getty.target",
    "ldconfig.service",
    "systemd-firstboot.service",
    "systemd-modules-load.service",
    "systemd-networkd.service",
    "systemd-random-seed.service",
    "systemd-resolved.service",
    "systemd-udev-trigger.service",
    "systemd-udevd.service",
    "systemd-update-utmp.service",
]

tar(
    name = "systemd_units_layer",
    compress = COMPRESSION,
    mtree = [
        # Default target — non-graphical.
        "./etc/systemd/system/default.target type=link uid=0 gid=0 link=/usr/lib/systemd/system/multi-user.target",
        # Enable shelley.socket (socket activation pulls in shelley.service via BindsTo).
        "./etc/systemd/system/sockets.target.wants type=dir uid=0 gid=0 mode=0755",
        "./etc/systemd/system/sockets.target.wants/shelley.socket type=link uid=0 gid=0 link=/etc/systemd/system/shelley.socket",
        # Enable exe-setup oneshot.
        "./etc/systemd/system/multi-user.target.wants type=dir uid=0 gid=0 mode=0755",
        "./etc/systemd/system/multi-user.target.wants/exe-setup.service type=link uid=0 gid=0 link=/etc/systemd/system/exe-setup.service",
    ] + [
        "./etc/systemd/system/{} type=link uid=0 gid=0 link=/dev/null".format(unit)
        for unit in _MASKED_UNITS
    ],
)

# Per-arch out-of-band binary layer: bazelisk + claude. Repos defined
# in //bazel/include:oci.MODULE.bazel; sha256 pinned there.
[
    tar(
        name = "binaries_layer_" + arch,
        srcs = [
            "@bazelisk_" + arch + "//file",
            "@claude_" + arch + "//file",
        ],
        compress = COMPRESSION,
        mtree = [
            "./usr/local/bin/bazelisk uid=0 gid=0 mode=0755 type=file content=$(execpath @bazelisk_{}//file)".format(arch),
            "./usr/local/bin/bazel type=link uid=0 gid=0 link=/usr/local/bin/bazelisk",
            "./usr/local/bin/claude uid=0 gid=0 mode=0755 type=file content=$(execpath @claude_{}//file)".format(arch),
        ],
    )
    for arch in WORKSTATION_ARCHITECTURES
]

# Per-arch flattened apt layer. WORKSTATION_PACKAGES is the resolved
# closure (direct + transitive) from debian.lock.json — listed
# explicitly in config.bzl so PR review sees every package landing in
# the rootfs.
[
    flatten(
        name = "apt_layer_" + arch,
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@workstation//{}/{}".format(pkg, arch)
            for pkg in WORKSTATION_PACKAGES
        ],
    )
    for arch in WORKSTATION_ARCHITECTURES
]

# Per-arch image manifest. No base — the apt layer is the rootfs.
[
    oci_image(
        name = "workstation_" + arch,
        annotations = {
            "org.opencontainers.image.description": "exe.dev developer workstation image",
            "org.opencontainers.image.source": "https://github.com/arkeros/senku/blob/main/devtools/workstation/BUILD",
        },
        cmd = ["/usr/local/bin/init"],
        ignore_cves = WORKSTATION_IGNORE_CVES + DEBIAN_WONTFIX_CVES,
        # exe.dev's shelley reads this to choose the SSH login user;
        # the image itself runs as root (needed for systemd PID 1).
        labels = {"exe.dev/login-user": "exedev"},
        layers = [
            ":apt_layer_" + arch,
            ":binaries_layer_" + arch,
            ":files_layer",
            ":systemd_units_layer",
        ],
        platform = ARCHITECTURE_PLATFORMS[arch],
        user = "0",
        working_dir = "/",
    )
    for arch in WORKSTATION_ARCHITECTURES
]

# Multi-arch index — one tag exposes both architectures.
image_index(
    name = "workstation",
    annotations = {
        "org.opencontainers.image.description": "exe.dev developer workstation image",
        "org.opencontainers.image.source": "https://github.com/arkeros/senku/blob/main/devtools/workstation/BUILD",
    },
    manifests = [
        ":workstation_" + arch
        for arch in WORKSTATION_ARCHITECTURES
    ],
)

image_push(
    name = "workstation_push",
    image = ":workstation",
    registry = OCI_REGISTRY,
    repository = OCI_REPOSITORY_PREFIX + "/workstation",
    stamp = "force",
    tag_list = [
        "latest",
        "{{.STABLE_MONOREPO_IMAGE_TAG_VERSION}}",
        "{{.STABLE_MONOREPO_SHORT_VERSION}}",
    ],
    tags = ["manual"],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
