load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("//distroless:distro.bzl", BUSYBOX_ARCHITECTURES = "ALL_ARCHITECTURES")
load(":busybox.bzl", "busybox_layer")
load(":config.bzl", "STATIC_ARCHITECTURES", "STATIC_DISTROS")
load(":static.bzl", "static_image", "static_image_index")

package(default_visibility = ["//visibility:public"])

[
    static_image(
        arch = arch,
        distro = distro,
    )
    for distro in STATIC_DISTROS
    for arch in STATIC_ARCHITECTURES[distro]
]

[
    busybox_layer(
        name = "busybox_" + arch + "_" + distro + "_layer",
        busybox = "@{}//{}/{}".format(distro, "busybox-static", arch),
        compress = "gzip",
    )
    for arch in BUSYBOX_ARCHITECTURES
    for distro in STATIC_DISTROS
]

[
    static_image_index(
        architectures = STATIC_ARCHITECTURES[distro],
        distro = distro,
    )
    for distro in STATIC_DISTROS
]

# Structure tests (amd64 only, tar driver doesn't need docker)
[
    container_structure_test(
        name = "static_" + user + "_test",
        size = "small",
        configs = [
            "test.yaml",
            "test_" + user + ".yaml",
        ],
        driver = "tar",
        image = ":static_" + user + "_amd64_debian13.tar",
    )
    for user in [
        "root",
        "nonroot",
    ]
]

container_structure_test(
    name = "static_debug_test",
    size = "small",
    configs = [
        "test.yaml",
        "test_debug.yaml",
        "test_nonroot.yaml",
    ],
    driver = "tar",
    image = ":static_debug_nonroot_amd64_debian13.tar",
    tags = ["no-local"],
)

bzl_library(
    name = "static",
    srcs = ["static.bzl"],
    deps = [
        "//distroless:distro",
        "//distroless/common:variables",
        "//oci",
        "@container_structure_test//:defs",
        "@rules_distroless//distroless:defs",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "busybox",
    srcs = ["busybox.bzl"],
    deps = [
        "//distroless/common:variables",
        "@rules_distroless//distroless:defs",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
