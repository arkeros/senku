load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load(":base.bzl", "base_image", "base_image_index")
load(":config.bzl", "BASE_ARCHITECTURES", "BASE_DISTROS", "BASE_PACKAGES")

package(default_visibility = ["//visibility:public"])

[
    flatten(
        name = arch + "_" + distro + "_layer",
        deduplicate = True,
        tars = [
            "@{}//{}/{}".format(distro, pkg, arch)
            for pkg in BASE_PACKAGES[distro]
        ],
    )
    for distro in BASE_DISTROS
    for arch in BASE_ARCHITECTURES[distro]
]

[
    base_image(
        arch = arch,
        distro = distro,
    )
    for distro in BASE_DISTROS
    for arch in BASE_ARCHITECTURES[distro]
]

[
    base_image_index(
        architectures = BASE_ARCHITECTURES[distro],
        distro = distro,
    )
    for distro in BASE_DISTROS
]

container_structure_test(
    name = "base_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "tar",
    image = ":base_nonroot_amd64_debian13.tar",
    tags = ["no-local"],
)

bzl_library(
    name = "base",
    srcs = ["base.bzl"],
    deps = [
        "//distroless/common:variables",
        "//oci",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
