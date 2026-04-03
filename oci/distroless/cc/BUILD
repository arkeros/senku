load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("//oci/distroless:distro.bzl", "distroless_matrix")
load("//oci/distroless/common:variables.bzl", "COMPRESSION")
load(":config.bzl", "CC_ARCHITECTURES", "CC_DISTROS", "CC_PACKAGES")

package(default_visibility = ["//visibility:public"])

[
    flatten(
        name = arch + "_" + distro + "_layer",
        compress = COMPRESSION,
        deduplicate = True,
        tars = [
            "@{}//{}/{}".format(distro, pkg, arch)
            for pkg in CC_PACKAGES[distro]
        ],
    )
    for distro in CC_DISTROS
    for arch in CC_ARCHITECTURES[distro]
]

[
    distroless_matrix(
        name = "cc",
        architectures = CC_ARCHITECTURES[distro],
        base = "//oci/distroless/static:static{mode}_{user}_{arch}_{distro}",
        distro = distro,
        layers = [
            ":{arch}_{distro}_layer",
            "@{distro}//libstdc++6/{arch}",
        ],
    )
    for distro in CC_DISTROS
]

container_structure_test(
    name = "cc_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "docker",
    image = ":cc_nonroot_amd64_debian13.oci_layout",
    tags = ["requires-docker"],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
