load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

# Tool binary for browser_dep rule
js_binary(
    name = "browser_dep_bin",
    data = [
        "//:node_modules/esbuild",
    ],
    entry_point = "browser_dep.mjs",
)

# Tool binary for browser_dep_group rule
js_binary(
    name = "browser_dep_group_bin",
    data = [
        "//:node_modules/esbuild",
    ],
    entry_point = "browser_dep_group.mjs",
)

exports_files(["devserver.mjs"])

# Browser_dep instantiations live in each consumer's repo (typically called
# in one shot via `panallet_browser_modules()` from `//devtools/build/panallet:install.bzl`).
# That keeps the npm packages they wrap pinned by the consumer rather than @senku.

bzl_library(
    name = "browser_dep",
    srcs = ["browser_dep.bzl"],
    deps = ["@aspect_rules_js//js:defs"],
)

bzl_library(
    name = "devserver",
    srcs = ["devserver.bzl"],
    deps = [
        "@aspect_rules_js//js:defs",
        "@bazel_lib//lib:copy_file",
    ],
)

bzl_library(
    name = "browser_dep_group",
    srcs = ["browser_dep_group.bzl"],
    deps = ["@aspect_rules_js//js:defs"],
)
