"defines a function to build base different distributions"

load("@rules_img//img:image.bzl", "image_index")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "DEBUG_MODE", "NONROOT")
load("//oci:oci.bzl", "oci_image")

USER_VARIANTS = [("root", 0, "/"), ("nonroot", NONROOT, "/home/nonroot")]

def base_image_index(distro, architectures):
    """Build image index for a distro

    Args:
        distro: name of distribution
        architectures: all architectures included in index
    """
    [
        image_index(
            name = "base" + mode + "_" + user + "_" + distro,
            manifests = [
                "base" + mode + "_" + user + "_" + arch + "_" + distro
                for arch in architectures
            ],
        )
        for (user, _, _) in USER_VARIANTS
        for mode in DEBUG_MODE
    ]

def base_image(distro, arch):
    """base and debug images for a distro/arch

    Args:
        distro: name of the distribution
        arch: the target architecture
    """
    name = "base"

    for (user, _, _) in USER_VARIANTS:
        for mode in DEBUG_MODE:
            oci_image(
                name = name + mode + "_" + user + "_" + arch + "_" + distro,
                base = "//distroless/static:static" + mode + "_" + user + "_" + arch + "_" + distro,
                layers = [
                    "//distroless/base:" + arch + "_" + distro + "_layer",
                    "@{}//{}/{}".format(distro, "libstdc++6", arch),
                ],
                platform = ARCHITECTURE_PLATFORMS[arch],
            )
