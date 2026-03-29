"defines a function to build static distroless images (no glibc)"

load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_img//img:image.bzl", "image_index")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "COMPRESSION", "DEBUG_MODE", "NONROOT")
load("//oci:oci.bzl", "oci_image")

USER_VARIANTS = [("root", 0, "/"), ("nonroot", NONROOT, "/home/nonroot")]

def static_image_index(distro, architectures):
    """Build image index for a distro

    Args:
        distro: name of distribution
        architectures: all architectures included in index
    """
    [
        image_index(
            name = "static" + mode + "_" + user + "_" + distro,
            manifests = [
                "static" + mode + "_" + user + "_" + arch + "_" + distro
                for arch in architectures
            ],
        )
        for (user, _, _) in USER_VARIANTS
        for mode in DEBUG_MODE
    ]

def static_image(distro, arch):
    """static and debug images for a distro/arch

    Args:
        distro: name of the distribution
        arch: the target architecture
    """
    name = "static"

    flatten(
        name = name + "_" + arch + "_" + distro + "_layer",
        tars = [
            "@{}//{}/{}".format(distro, "base-files", arch),
            "@{}//{}/{}".format(distro, "netbase", arch),
            "@{}//{}/{}".format(distro, "tzdata", arch),
            "@{}//{}/{}".format(distro, "media-types", arch),
            "//distroless/common:rootfs",
            "//distroless/common:passwd",
            "//distroless/common:home",
            "//distroless/common:group",
            "//distroless/common:tmp",
            "//distroless/common:os_release_" + distro,
            "//distroless/common:cacerts_" + distro + "_" + arch,
        ],
        compress = COMPRESSION,
        deduplicate = True,
    )

    for (user, uid, working_dir) in USER_VARIANTS:
        oci_image(
            name = name + "_" + user + "_" + arch + "_" + distro,
            env = {
                "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "SSL_CERT_FILE": "/etc/ssl/certs/ca-certificates.crt",
            },
            layers = [
                ":" + name + "_" + arch + "_" + distro + "_layer",
            ],
            user = "%d" % uid,
            working_dir = working_dir,
            platform = ARCHITECTURE_PLATFORMS[arch],
        )

        # A static debug image with busybox available.
        oci_image(
            name = name + "_debug_" + user + "_" + arch + "_" + distro,
            base = ":" + name + "_" + user + "_" + arch + "_" + distro,
            entrypoint = ["/busybox/sh"],
            env = {"PATH": "$PATH:/busybox"},
            layers = [
                "busybox_" + arch + "_" + distro + "_layer",
            ],
            platform = ARCHITECTURE_PLATFORMS[arch],
        )
