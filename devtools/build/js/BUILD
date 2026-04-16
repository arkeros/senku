load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load(":browser_dep.bzl", "browser_dep")

package(default_visibility = ["//visibility:public"])

# Tool binary for browser_dep rule
js_binary(
    name = "browser_dep_bin",
    data = [
        "//:node_modules/esbuild",
    ],
    entry_point = "browser_dep.mjs",
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

browser_dep(
    name = "react",
    package = "react",
    deps = ["//:node_modules/react"],
)

browser_dep(
    name = "react_jsx_runtime",
    package = "react/jsx-runtime",
    deps = ["//:node_modules/react"],
)

browser_dep(
    name = "react_dom_client",
    package = "react-dom/client",
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
