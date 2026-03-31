load("@rules_img//img:image.bzl", "image_index")
load("@tar.bzl", "mutate", "tar")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "NONROOT")
load("//oci:oci.bzl", "oci_image")
load(":config.bzl", "NGINX_ARCHITECTURES")

def frontend_image(
        name,
        srcs,
        strip_prefix = None,
        distro = "debian13",
        ignore_cves = None,
        visibility = None):
    """Build a multi-arch frontend image serving static files with nginx.

    Static files are placed in /var/www/html on top of the nginx mainline
    nonroot base image.

    Args:
        name: target name
        srcs: static files to serve (e.g., a filegroup of built frontend assets)
        strip_prefix: prefix to strip from file paths before placing in /var/www/html.
            Defaults to the current package name.
        distro: distribution to use (default: debian13)
        ignore_cves: list of CVE IDs to ignore in scanning
        visibility: target visibility
    """
    architectures = NGINX_ARCHITECTURES[distro]

    tar(
        name = name + "_statics_layer",
        srcs = srcs,
        mutate = mutate(
            owner = str(NONROOT),
            ownername = "nonroot",
            package_dir = "/var/www/html",
            strip_prefix = strip_prefix or native.package_name(),
        ),
    )

    [
        oci_image(
            name = name + "_" + arch,
            base = "//distroless/nginx:nginx_mainline_nonroot_" + arch + "_" + distro,
            layers = [name + "_statics_layer"],
            platform = ARCHITECTURE_PLATFORMS[arch],
            ignore_cves = ignore_cves,
            visibility = visibility,
        )
        for arch in architectures
    ]

    image_index(
        name = name,
        manifests = [name + "_" + arch for arch in architectures],
        visibility = visibility,
    )
