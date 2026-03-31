load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_img//img:image.bzl", "image_index")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "DEBUG_MODE", "USERS")
load("//oci:oci.bzl", "oci_image")

def nginx_image_index(name, version_label, distro, architectures):
    """nginx image index for a distro

    Args:
        name: base name of image
        version_label: stable or mainline
        distro: name of distribution
        architectures: all architectures included in index
    """
    [
        image_index(
            name = name + "_" + version_label + mode + "_" + user + "_" + distro,
            annotations = {
                "org.opencontainers.image.description": "Distroless nginx %s image%s" % (version_label, " (debug)" if mode else ""),
                "org.opencontainers.image.source": "https://github.com/arkeros/senku/blob/main/distroless/nginx/BUILD",
            },
            manifests = [
                name + "_" + version_label + mode + "_" + user + "_" + arch + "_" + distro
                for arch in architectures
            ],
        )
        for mode in DEBUG_MODE
        for user in USERS
    ]

def nginx_image(
        name,
        version_label,
        distro,
        arch,
        ignore_cves = None):
    [
        oci_image(
            name = name + "_" + version_label + mode + "_" + user + "_" + arch + "_" + distro,
            base = "//distroless/bash:bash" + mode + "_" + user + "_" + arch + "_" + distro,
            entrypoint = ["/usr/sbin/nginx", "-e", "/dev/stderr", "-g", "daemon off;"],
            ignore_cves = ignore_cves,
            layers = [
                "//distroless/nginx:" + version_label + "_" + arch + "_" + distro + "_layer",
                "//distroless/nginx:nginx_conf_layer",
            ],
            platform = ARCHITECTURE_PLATFORMS[arch],
        )
        for mode in DEBUG_MODE
        for user in USERS
    ]
