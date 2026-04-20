load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

bzl_library(
    name = "extensions",
    srcs = ["extensions.bzl"],
    visibility = ["//visibility:public"],
    deps = [":versions"],
)

bzl_library(
    name = "versions",
    srcs = ["versions.bzl"],
    visibility = ["//visibility:public"],
)
