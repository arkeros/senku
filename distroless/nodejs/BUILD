load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "nodejs",
    srcs = ["nodejs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        ":config",
        "//distroless:distro",
        "//distroless/common:variables",
        "//oci",
        "@aspect_rules_js//js:defs",
        "@aspect_rules_py//py:defs",
        "@container_structure_test//:defs",
        "@rules_img//img:image",
    ],
)
