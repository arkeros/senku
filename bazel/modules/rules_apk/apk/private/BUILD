load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//apk:__subpackages__"])

bzl_library(
    name = "install",
    srcs = ["install.bzl"],
    deps = [":lockfile"],
)

bzl_library(
    name = "per_package",
    srcs = ["per_package.bzl"],
    deps = [":providers"],
)

bzl_library(
    name = "providers",
    srcs = ["providers.bzl"],
)

bzl_library(
    name = "gather",
    srcs = ["gather.bzl"],
    deps = [":providers"],
)

bzl_library(
    name = "apkdb_merge",
    srcs = ["apkdb_merge.bzl"],
    deps = [
        ":gather",
        ":providers",
    ],
)

bzl_library(
    name = "lockfile",
    srcs = ["lockfile.bzl"],
)

bzl_library(
    name = "pin",
    srcs = ["pin.bzl"],
)

exports_files(["pin.sh.tpl"])
