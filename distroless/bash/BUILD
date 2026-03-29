load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_img//img:push.bzl", "image_push")
load("//distroless:distro.bzl", BUSYBOX_ARCHITECTURES = "ALL_ARCHITECTURES")
load("//distroless/common:variables.bzl", "DEBUG_MODE", "USERS")
load("//oci:config.bzl", "OCI_REGISTRY", "OCI_REPOSITORY_PREFIX")
load(":bash.bzl", "bash_image", "bash_image_index")
load(":config.bzl", "BASH_ARCHITECTURES", "BASH_DISTROS")

package(default_visibility = ["//visibility:public"])

[
    bash_image(
        name = "bash",
        arch = arch,
        distro = distro,
    )
    for distro in BASH_DISTROS
    for arch in BASH_ARCHITECTURES[distro]
]

[
    bash_image_index(
        name = "bash",
        architectures = BASH_ARCHITECTURES[distro],
        distro = distro,
    )
    for distro in BASH_DISTROS
]

[
    flatten(
        name = arch + "_" + distro + "_layer",
        deduplicate = True,
        tars = [
            "@{}//{}/{}".format(distro, "bash", arch),
            # for runfiles we need: env, sed, grep & awk
            # rust-coreutils provides /usr/bin/env without libsystemd0 dependency
            "@{}//{}/{}".format(distro, "rust-coreutils", arch),
            "//distroless/common:coreutils_links",
            "@{}//{}/{}".format(distro, "sed", arch),
            "@{}//{}/{}".format(distro, "grep", arch),
            "@{}//{}/{}".format(distro, "mawk", arch),
            "//distroless/common:awk",
        ],
    )
    for distro in BASH_DISTROS
    for arch in BASH_ARCHITECTURES[distro]
]

[
    image_push(
        name = "bash" + mode + "_push",
        image = ":bash" + mode + "_nonroot_debian13",
        registry = OCI_REGISTRY,
        repository = OCI_REPOSITORY_PREFIX + "/bash",
        stamp = "enabled",
        tag_list = [
            "debug" if mode else "latest",
            "{STABLE_MONOREPO_VERSION}",
            "{STABLE_MONOREPO_SHORT_VERSION}",
        ],
        tags = ["manual"],
    )
    for mode in DEBUG_MODE
]

container_structure_test(
    name = "bash_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "tar",
    image = ":bash_nonroot_amd64_debian13.tar",
    tags = ["no-local"],
)

bzl_library(
    name = "bash",
    srcs = ["bash.bzl"],
    deps = [
        "//distroless:distro",
        "//distroless/common:variables",
        "//oci",
        "@container_structure_test//:defs",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
