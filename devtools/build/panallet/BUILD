load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

bzl_library(
    name = "install",
    srcs = ["install.bzl"],
    deps = [
        "//devtools/build/js:browser_dep",
        "//devtools/build/js:browser_dep_group",
    ],
)
