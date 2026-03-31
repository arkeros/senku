load("@rules_img//img:image.bzl", "image_index")
load("@tar.bzl", "mutate", "tar")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "NONROOT")
load("//oci:oci.bzl", "oci_image")
load(":config.bzl", "NGINX_ARCHITECTURES")

def frontend_image_index(name, architectures):
    """frontend image index

    Args:
        name: base name of image
        architectures: all architectures included in index
    """
    image_index(
        name = name,
        manifests = [
            name + "_" + arch
            for arch in architectures
        ],
    )

def frontend_image(
        name,
        distro,
        arch,
        statics_layer,
        base = None,
        ignore_cves = None):
    oci_image(
        name = name + "_" + arch,
        base = base or "//distroless/nginx:nginx_mainline_nonroot_" + arch + "_" + distro,
        layers = [statics_layer],
        platform = ARCHITECTURE_PLATFORMS[arch],
        ignore_cves = ignore_cves,
    )

def frontend_images_all_arch(
        name,
        srcs,
        base = None,
        owner = str(NONROOT),
        ownername = "nonroot",
        strip_prefix = None,
        distro = "debian13",
        ignore_cves = None,
        visibility = None):
    """Build frontend images for all architectures serving static files with nginx.

    Static files are placed in /var/www/html on top of the nginx base image.

    Args:
        name: target name
        srcs: static files to serve (e.g., a filegroup of built frontend assets)
        base: base image per arch, as a dict {"amd64": "//my:image_amd64", ...}.
            Defaults to nginx mainline nonroot.
        owner: uid for static files (default: 65532/nonroot)
        ownername: uname for static files (default: nonroot)
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
            owner = owner,
            ownername = ownername,
            package_dir = "/var/www/html",
            strip_prefix = strip_prefix or native.package_name(),
        ),
        visibility = visibility,
    )

    [
        frontend_image(
            name = name,
            distro = distro,
            arch = arch,
            statics_layer = name + "_statics_layer",
            base = base.get(arch) if base else None,
            ignore_cves = ignore_cves,
        )
        for arch in architectures
    ]

    frontend_image_index(
        name = name,
        architectures = architectures,
    )
