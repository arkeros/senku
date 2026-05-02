load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
load("@bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

# The esbuild rule requires its `config` file to live in the caller's
# package or to be pre-copied into bazel-bin. Wrap the config in
# copy_to_bin here so react_app.bzl can pass `config = Label(":esbuild_react_dedup.config")`
# from any package without cross-package-source friction.
copy_to_bin(
    name = "esbuild_react_dedup.config",
    srcs = ["esbuild_react_dedup.config.mjs"],
)

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

# Dual-compile script: runs @babel/core with the strip-server-only-exports
# plugin to produce {client.js, server.js} pairs for SSR route components.
# Wired into the build pipeline by react_ssr_app's react_component extension
# (roadmap step 3).
js_binary(
    name = "dual_compile_bin",
    data = [
        "//:node_modules/@babel/core",
        "//:node_modules/@babel/preset-react",
        "//:node_modules/@babel/preset-typescript",
    ],
    entry_point = "dual_compile.mjs",
)

js_test(
    name = "dual_compile_test",
    data = [
        "dual_compile.mjs",
        "//:node_modules/@babel/core",
        "//:node_modules/@babel/preset-react",
        "//:node_modules/@babel/preset-typescript",
    ],
    entry_point = "dual_compile_test.mjs",
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
    data = [
        "//:node_modules/ramda",
    ],
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
    data = [
        "//:node_modules/ramda",
    ],
    entry_point = "asset_codegen.mjs",
)

js_test(
    name = "asset_codegen_test",
    data = [
        "asset_codegen.mjs",
        "//:node_modules/ramda",
    ],
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

# i18n extract refs: scans component sources for <Trans id="..." /> and
# format("...") call sites, rejects dynamic <Trans> ids, emits a JSON
# manifest of referenced keys that i18n_merge cross-checks against the
# source-locale merged catalog.
js_binary(
    name = "i18n_extract_refs_bin",
    entry_point = "i18n_extract_refs.mjs",
)

js_test(
    name = "i18n_extract_refs_test",
    data = ["i18n_extract_refs.mjs"],
    entry_point = "i18n_extract_refs_test.mjs",
)

# i18n merge: reads a manifest of per-component catalog fragments and emits
# one merged JSON per locale. Enforces five invariants as build errors:
# no in-locale collisions, no missing translations, no stray keys, no
# malformed MF2 syntax, and no referenced-but-undefined ids (every
# <Trans id="..." /> resolves to a catalog key).
js_binary(
    name = "i18n_merge_bin",
    data = ["//:node_modules/messageformat"],
    entry_point = "i18n_merge.mjs",
)

js_test(
    name = "i18n_merge_test",
    data = [
        "i18n_merge.mjs",
        "//:node_modules/messageformat",
    ],
    entry_point = "i18n_merge_test.mjs",
)

# i18n codegen: emits the per-app TS manifest inlining each declared locale's
# merged catalog as TS literals.
js_binary(
    name = "i18n_codegen_bin",
    entry_point = "i18n_codegen.mjs",
)

js_test(
    name = "i18n_codegen_test",
    data = ["i18n_codegen.mjs"],
    entry_point = "i18n_codegen_test.mjs",
)

# i18n bundle orchestrator: single action that runs merge + codegen together.
# Keeps i18n_merge.mjs and i18n_codegen.mjs independently unit-testable while
# letting Bazel rules declare both the per-locale merged JSONs and the TS
# manifest as outputs of one action (instead of chaining two).
js_binary(
    name = "i18n_bundle_bin",
    data = [
        "i18n_codegen.mjs",
        "i18n_merge.mjs",
        "//:node_modules/messageformat",
    ],
    entry_point = "i18n_bundle.mjs",
)

exports_files(
    [
        "default.conf.tpl",
        "esbuild_react_dedup.config.mjs",
        "index.html.tpl",
    ],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "react_app",
    srcs = ["react_app.bzl"],
    deps = [
        ":i18n_artifacts",
        ":labels",
        ":react_app_manifest",
        ":react_component",
        ":route_tree",
        ":runtime_config",
        ":stylex_css",
        "//devtools/build/js:devserver",
        "@aspect_rules_esbuild//esbuild:defs",
        "@aspect_rules_js//js:defs",
        "@bazel_lib//lib:expand_template",
    ],
)

bzl_library(
    name = "react_ssr_app",
    srcs = ["react_ssr_app.bzl"],
    deps = [
        ":react_component",
        ":runtime_config",
        "@aspect_rules_esbuild//esbuild:defs",
        "@bazel_skylib//rules:write_file",
    ],
)

bzl_library(
    name = "react_ssr_component",
    srcs = ["react_ssr_component.bzl"],
    deps = [
        ":react_component",
        "@aspect_rules_js//js:defs",
    ],
)

bzl_library(
    name = "react_static_layer",
    srcs = ["react_static_layer.bzl"],
    deps = [
        "//oci:frontend_image",
        "@bazel_lib//lib:copy_to_directory",
        "@bazel_lib//lib:expand_template",
    ],
)

bzl_library(
    name = "runtime_config",
    srcs = ["runtime_config.bzl"],
    deps = [
        ":react_component",
        "@bazel_skylib//rules:write_file",
    ],
)

bzl_library(
    name = "i18n_artifacts",
    srcs = ["i18n_artifacts.bzl"],
    deps = [
        ":_artifact_aspect",
        ":react_component",
    ],
)

bzl_library(
    name = "react_component",
    srcs = ["react_component.bzl"],
    deps = [
        ":_artifact_outputs",
        ":i18n_extract_refs",
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
    name = "react_app_manifest",
    srcs = ["react_app_manifest.bzl"],
    deps = [":route_tree"],
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
    name = "_compiler_options",
    srcs = ["_compiler_options.bzl"],
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
    name = "i18n_extract_refs",
    srcs = ["i18n_extract_refs.bzl"],
)

bzl_library(
    name = "labels",
    srcs = ["labels.bzl"],
)

bzl_library(
    name = "route_tree",
    srcs = ["route_tree.bzl"],
)
