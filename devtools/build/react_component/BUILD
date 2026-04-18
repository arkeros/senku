load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
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

# Asset codegen: reads a hash_and_copy manifest and emits <Component>.assets.ts
# with typed URL consts. Identifier derivation rules live here.
js_binary(
    name = "asset_codegen_bin",
    entry_point = "asset_codegen.mjs",
)

js_test(
    name = "asset_codegen_test",
    data = ["asset_codegen.mjs"],
    entry_point = "asset_codegen_test.mjs",
)

# App-level asset aggregator: merges per-leaf hash_assets manifests into
# a single devserver manifest and copies every hashed file into one flat
# directory siblings to the manifest.
js_binary(
    name = "asset_manifest_merge_bin",
    entry_point = "asset_manifest_merge.mjs",
)

js_test(
    name = "asset_manifest_merge_test",
    data = ["asset_manifest_merge.mjs"],
    entry_point = "asset_manifest_merge_test.mjs",
)

exports_files(["index.html.tpl"])

bzl_library(
    name = "react_app",
    srcs = ["react_app.bzl"],
    deps = [
        ":labels",
        ":react_app_manifest",
        ":react_component",
        ":stylex_css",
        "//devtools/build/js:devserver",
        "@aspect_rules_esbuild//esbuild:defs",
        "@aspect_rules_js//js:defs",
        "@bazel_lib//lib:expand_template",
    ],
)

bzl_library(
    name = "react_component",
    srcs = ["react_component.bzl"],
    deps = [
        ":_artifact_outputs",
        ":labels",
        ":stylex_transpile",
        "@aspect_rules_js//js:defs",
        "@aspect_rules_ts//ts:defs",
        "@bazel_skylib//rules:write_file",
    ],
)

bzl_library(
    name = "stylex_library",
    srcs = ["stylex_library.bzl"],
    deps = [
        ":_artifact_outputs",
        ":labels",
        ":stylex_transpile",
        "@aspect_rules_ts//ts:defs",
    ],
)

bzl_library(
    name = "stylex_transpile",
    srcs = ["stylex_transpile.bzl"],
    deps = [
        "@aspect_rules_js//js:defs",
        "@bazel_lib//lib:copy_file",
        "@bazel_lib//lib:copy_to_bin",
    ],
)

bzl_library(
    name = "stylex_css",
    srcs = ["stylex_css.bzl"],
    deps = [":_artifact_aspect"],
)

bzl_library(
    name = "output_group_test",
    testonly = True,
    deps = ["@bazel_skylib//rules:build_test"],
)

bzl_library(
    name = "asset_library",
    srcs = ["asset_library.bzl"],
    deps = [
        ":_artifact_outputs",
        ":_hash_assets",
        ":asset_codegen",
        "@aspect_rules_ts//ts:defs",
    ],
)

bzl_library(
    name = "asset_pipeline",
    srcs = ["asset_pipeline.bzl"],
    deps = [":_artifact_aspect"],
)

bzl_library(
    name = "_artifact_aspect",
    srcs = ["_artifact_aspect.bzl"],
)

bzl_library(
    name = "_artifact_outputs",
    srcs = ["_artifact_outputs.bzl"],
)

bzl_library(
    name = "_hash_assets",
    srcs = ["_hash_assets.bzl"],
)

bzl_library(
    name = "asset_codegen",
    srcs = ["asset_codegen.bzl"],
)

bzl_library(
    name = "labels",
    srcs = ["labels.bzl"],
)

bzl_library(
    name = "react_app_manifest",
    srcs = ["react_app_manifest.bzl"],
)
