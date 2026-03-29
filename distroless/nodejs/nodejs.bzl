load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_image_layer")
load("@aspect_rules_py//py:defs.bzl", "py_image_layer")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@npm//:@google-cloud/functions-framework/package_json.bzl", functions_framework_bin = "bin")
load("@rules_img//img:image.bzl", "image_index")
load("//distroless:distro.bzl", "ARCHITECTURE_PLATFORMS")
load("//distroless/common:variables.bzl", "COMPRESSION", "DEBUG_MODE", "USERS", "USER_IDS")
load("//oci:oci.bzl", "oci_image")
load(":config.bzl", "NODEJS_ARCHITECTURES", "NODEJS_DISTROS")

def nodejs_image_index(name, distro, architectures):
    """nodejs image index for a distro

    Args:
        name: base name of image
        distro: name of distribution
        architectures: all architectures included in index
    """
    for mode in DEBUG_MODE:
        for user in USERS:
            index_name = name + mode + "_" + user
            image_index(
                name = index_name,
                manifests = [
                    name + mode + "_" + user + "_" + arch
                    for arch in architectures
                ],
            )

def nodejs_image(
        name,
        distro,
        arch,
        binary,
        entrypoint,
        extra_layers = [],
        ignore_cves = None):
    [
        js_image_layer(
            name = name + "_" + user + "_" + arch + "_layer",
            binary = binary,
            platform = ARCHITECTURE_PLATFORMS[arch],
            root = "/",
            compression = COMPRESSION,
            owner = "%s:%s" % (USER_IDS[user], USER_IDS[user]),
        )
        for user in USERS
    ]

    [
        oci_image(
            name = name + mode + "_" + user + "_" + arch,
            base = "//distroless/bash:bash" + mode + "_" + user + "_" + arch + "_" + distro,
            entrypoint = entrypoint,
            working_dir = "/",
            env = {
                "NODE_ENV": "production",
            },
            layers = extra_layers + [
                name + "_" + user + "_" + arch + "_layer",
            ],
            platform = ARCHITECTURE_PLATFORMS[arch],
            ignore_cves = ignore_cves,
        )
        for mode in DEBUG_MODE
        for user in USERS
    ]

def nodejs_images_all_arch(name, distro, binary, entrypoint, extra_layers = {}, ignore_cves = None):
    """nodejs images for all architectures for a distro

    Args:
        name: base name of image
        distro: name of distribution
        binary: binary target to include in image
        entrypoint: entrypoint for image
        extra_layers: dictionary of layers to include in the image, per architecture
    """
    architectures = NODEJS_ARCHITECTURES[distro]

    [
        nodejs_image(
            name = name,
            distro = distro,
            arch = arch,
            binary = binary,
            entrypoint = entrypoint,
            extra_layers = extra_layers.get(arch, []),
            ignore_cves = ignore_cves,
        )
        for arch in architectures
    ]

    nodejs_image_index(
        name = name,
        architectures = architectures,
        distro = distro,
    )

def functions_framework_image(
        name,
        ts_lib,
        data = [],
        dependencies = [],
        **kwargs):
    lib_name = ts_lib.split(":")[-1]

    functions_framework_bin.functions_framework_binary(
        name = "server",
        args = ["--source={}/{}.pkg".format(native.package_name(), lib_name)],
        data = [
            ts_lib,
        ] + data + ["//:node_modules/" + d for d in dependencies],
    )

    nodejs_images_all_arch(
        name = name,
        binary = ":server",
        entrypoint = [
            "/{}/server".format(native.package_name()),
            "--source=/{}/{}.runfiles/_main/{}/{}.pkg".format(native.package_name(), "server", native.package_name(), lib_name),
        ],
        **kwargs
    )
