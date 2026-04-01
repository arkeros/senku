load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

bzl_library(
    name = "bifrost",
    srcs = ["bifrost.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        ":render",
        "@bazel_skylib//rules:write_file",
    ],
)

bzl_library(
    name = "render",
    srcs = ["render.bzl"],
    visibility = ["//visibility:public"],
    deps = ["@rules_img//img/private/providers:deploy_info"],
)
