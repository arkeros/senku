load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

bzl_library(
    name = "go",
    srcs = ["go.bzl"],
    deps = [
        ":config",
        "//distroless/common:variables",
        "//oci",
        "@bazel_lib//lib:transitions",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
