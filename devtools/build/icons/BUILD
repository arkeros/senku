load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")

package(default_visibility = ["//visibility:public"])

# SVG → PNG via resvg's wasm build. Deliberately the wasm package and not the
# native one: the native build ships eight platform-specific binaries as
# optional deps, which would make icon bytes depend on the build machine.
js_binary(
    name = "rasterize_bin",
    data = [
        "png_opaque.mjs",
        "//:node_modules/@resvg/resvg-wasm",
    ],
    entry_point = "rasterize.mjs",
)

js_test(
    name = "rasterize_test",
    data = [
        "png_opaque.mjs",
        "rasterize.mjs",
    ],
    entry_point = "rasterize_test.mjs",
)

# Guards the one iOS rule that fails silently: an apple-touch-icon with any
# transparency is composited onto black, so rounded corners in the source SVG
# become black wedges on the home screen.
# Wraps the 32px PNG in an ICO. Exists so /favicon.ico is not answered by the
# SPA fallback with a 200 text/html page; see png_to_ico.mjs.
js_binary(
    name = "png_to_ico_bin",
    data = ["png_opaque.mjs"],
    entry_point = "png_to_ico.mjs",
)

js_test(
    name = "png_to_ico_test",
    data = [
        "png_opaque.mjs",
        "png_to_ico.mjs",
    ],
    entry_point = "png_to_ico_test.mjs",
)

js_test(
    name = "png_opaque_test",
    data = ["png_opaque.mjs"],
    entry_point = "png_opaque_test.mjs",
)

bzl_library(
    name = "icons",
    srcs = ["icons.bzl"],
    deps = [
        "//oci:frontend_image",
        "@aspect_rules_js//js:defs",
        "@bazel_skylib//rules:write_file",
        "@tar.bzl//:tar",
    ],
)
