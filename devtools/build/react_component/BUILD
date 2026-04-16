load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

# Transpile script: runs @babel/core to produce .js + .js.map + .stylex.json
js_binary(
    name = "stylex_transpile_bin",
    data = [
        "//:node_modules/@babel/core",
        "//:node_modules/@babel/preset-react",
        "//:node_modules/@babel/preset-typescript",
        "//:node_modules/@stylexjs/babel-plugin",
    ],
    entry_point = "stylex_transpile.mjs",
)

# CSS collector: merges .stylex.json files into a single .css
js_binary(
    name = "stylex_collect_css_bin",
    data = [
        "//:node_modules/@stylexjs/babel-plugin",
    ],
    entry_point = "stylex_collect_css.mjs",
)

# Route codegen: generates router.tsx + main.tsx from route manifest
js_binary(
    name = "react_app_codegen_bin",
    entry_point = "react_app_codegen.mjs",
)

# PostCSS JIT props: tree-shakes unused Open Props custom properties
js_binary(
    name = "postcss_jit_bin",
    data = [
        "//:node_modules/open-props",
        "//:node_modules/postcss",
        "//:node_modules/postcss-jit-props",
    ],
    entry_point = "postcss_jit.mjs",
)

exports_files(["index.html.tpl"])

bzl_library(
    name = "react_app",
    srcs = ["react_app.bzl"],
    deps = [
        ":react_component",
        ":stylex_css",
        "//devtools/build/js:devserver",
        "@aspect_rules_esbuild//esbuild:defs",
        "@aspect_rules_js//js:defs",
        "@bazel_lib//lib:expand_template",
        "@bazel_skylib//rules:write_file",
    ],
)

bzl_library(
    name = "react_component",
    srcs = ["react_component.bzl"],
    deps = [
        "@aspect_rules_js//js:defs",
        "@aspect_rules_ts//ts:defs",
        "@bazel_lib//lib:copy_file",
        "@bazel_lib//lib:copy_to_bin",
    ],
)

bzl_library(
    name = "stylex_css",
    srcs = ["stylex_css.bzl"],
    deps = ["@aspect_rules_js//js:defs"],
)

bzl_library(
    name = "react_app_manifest",
    srcs = ["react_app_manifest.bzl"],
    deps = [":providers"],
)

bzl_library(
    name = "react_library",
    srcs = ["react_library.bzl"],
    deps = [":providers"],
)

bzl_library(
    name = "providers",
    srcs = ["providers.bzl"],
)
