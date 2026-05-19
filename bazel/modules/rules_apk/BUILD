load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

# Re-export shim: lets consumers `load("@rules_apk", "apk_package", "apkdb_merge")`
# instead of the longer `@rules_apk//apk:defs.bzl`. Same shape as @rules_rpm.
bzl_library(
    name = "rules_apk",
    srcs = ["rules_apk.bzl"],
    deps = ["//apk:defs"],
)

exports_files(["rules_apk.bzl"])
