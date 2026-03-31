load("@rules_img//img:image.bzl", "image_index")
load("@tar.bzl", "mutate", "tar")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "NONROOT")
load("//oci:oci.bzl", "oci_image")
load(":config.bzl", "NGINX_ARCHITECTURES")

def frontend_image(
        name,
        srcs,
        base = None,
        architectures = None,
        owner = str(NONROOT),
        ownername = "nonroot",
        strip_prefix = None,
        distro = "debian13",
        ignore_cves = None,
        visibility = None):
    """Build frontend image(s) serving static files with nginx.

    Static files are placed in /var/www/html on top of the nginx base image.
    When multiple architectures are specified, a multi-arch index is also created.

    Args:
        name: target name
        srcs: static files to serve (e.g., a filegroup of built frontend assets)
        base: base image per arch, as a dict {"amd64": "//my:image_amd64", ...}.
            Defaults to nginx mainline nonroot.
        architectures: list of architectures to build for (default: all from distro config)
        owner: uid for static files (default: 65532/nonroot)
        ownername: uname for static files (default: nonroot)
        strip_prefix: prefix to strip from file paths before placing in /var/www/html.
            Defaults to the current package name.
        distro: distribution to use (default: debian13)
        ignore_cves: list of CVE IDs to ignore in scanning
        visibility: target visibility
    """
    architectures = architectures or NGINX_ARCHITECTURES[distro]

    tar(
        name = name + "_statics_layer",
        srcs = srcs,
        mutate = mutate(
            owner = owner,
            ownername = ownername,
            package_dir = "/var/www/html",
            strip_prefix = strip_prefix or native.package_name(),
        ),
    )

    [
        oci_image(
            name = name + "_" + arch,
            base = base[arch] if base else "//distroless/nginx:nginx_mainline_nonroot_" + arch + "_" + distro,
            layers = [name + "_statics_layer"],
            platform = ARCHITECTURE_PLATFORMS[arch],
            ignore_cves = ignore_cves,
            visibility = visibility,
        )
        for arch in architectures
    ]

    if len(architectures) > 1:
        image_index(
            name = name,
            manifests = [name + "_" + arch for arch in architectures],
            visibility = visibility,
        )
