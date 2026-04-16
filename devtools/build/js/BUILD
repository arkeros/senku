load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load(":browser_dep.bzl", "browser_dep")
load(":browser_dep_group.bzl", "browser_dep_group")

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

# Shared browser deps — built once, used by all apps in the monorepo.
#
# When your component imports a new npm package that the browser needs at
# runtime, add a browser_dep target here and reference it from your
# devserver's browser_deps list. Example:
#
#   browser_dep(
#       name = "my_library",
#       package = "my-library",
#       deps = ["//:node_modules/my-library"],
#   )
#
# CJS packages are automatically bundled to ESM. ESM packages are served
# directly from node_modules — no bundling overhead.

browser_dep_group(
    name = "react",
    packages = [
        "react",
        "react-dom/client",
        "react/jsx-runtime",
    ],
    deps = [
        "//:node_modules/react",
        "//:node_modules/react-dom",
    ],
)

browser_dep(
    name = "react_router",
    package = "react-router",
    deps = [
        "//:node_modules/react",
        "//:node_modules/react-dom",
        "//:node_modules/react-router",
    ],
)

browser_dep(
    name = "cookie",
    package = "cookie",
    deps = ["//:node_modules/cookie"],
)

browser_dep(
    name = "set_cookie_parser",
    package = "set-cookie-parser",
    deps = ["//:node_modules/set-cookie-parser"],
)

browser_dep(
    name = "stylex",
    package = "@stylexjs/stylex",
    deps = ["//:node_modules/@stylexjs/stylex"],
)

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
