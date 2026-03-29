load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_img//img:image.bzl", "image_index")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "DEBUG_MODE", "USERS")
load("//oci:oci.bzl", "oci_image")

def bash_image_index(name, distro, architectures):
    """bash image index for a distro

    Args:
        name: base name of image
        distro: name of distribution
        architectures: all architectures included in index
    """
    [
        image_index(
            name = name + mode + "_" + user + "_" + distro,
            manifests = [
                name + mode + "_" + user + "_" + arch + "_" + distro
                for arch in architectures
            ],
        )
        for mode in DEBUG_MODE
        for user in USERS
    ]

def bash_image(
        name,
        distro,
        arch):
    [
        oci_image(
            name = name + mode + "_" + user + "_" + arch + "_" + distro,
            base = "//distroless/base:base" + mode + "_" + user + "_" + arch + "_" + distro,
            entrypoint = ["/usr/bin/bash"],
            layers = [
                "//distroless/bash:" + arch + "_" + distro + "_layer",
            ],
            platform = ARCHITECTURE_PLATFORMS[arch],
        )
        for mode in DEBUG_MODE
        for user in USERS
    ]
