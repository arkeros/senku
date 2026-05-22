load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

exports_files(["defs.bzl"])

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    deps = [
        "//apk/private:apkdb_merge",
        "//apk/private:gather",
        "//apk/private:per_package",
        "//apk/private:providers",
    ],
)

bzl_library(
    name = "extensions",
    srcs = ["extensions.bzl"],
    deps = ["//apk/private:install"],
)
