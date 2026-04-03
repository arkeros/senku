load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

bzl_library(
    name = "distro",
    srcs = ["distro.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "//oci",
        "//oci/distroless/common:variables",
        "@rules_img//img:image",
    ],
)
