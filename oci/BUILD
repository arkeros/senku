load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

bzl_library(
    name = "oci",
    srcs = ["oci.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "@grype.bzl//:grype",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "go_image",
    srcs = ["go_image.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        ":config",
        ":oci",
        "//distroless/common:variables",
        "@bazel_lib//lib:transitions",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "js_image",
    srcs = ["js_image.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        ":config",
        ":oci",
        "//distroless:distro",
        "//distroless/common:variables",
        "@aspect_rules_js//js:defs",
        "@aspect_rules_py//py:defs",
        "@container_structure_test//:defs",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "py_image",
    srcs = ["py_image.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        ":config",
        ":oci",
        "//distroless:distro",
        "//distroless/common:variables",
        "@aspect_rules_py//py:defs",
        "@container_structure_test//:defs",
        "@rules_img//img:image",
    ],
)
