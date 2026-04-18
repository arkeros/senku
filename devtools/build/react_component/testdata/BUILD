load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("//devtools/build/react_component:_hash_assets.bzl", "hash_assets")
load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")

hash_assets(
    name = "hashed",
    testonly = True,
    srcs = ["logo.svg"],
)

build_test(
    name = "hash_assets_build_test",
    targets = [":hashed"],
)

require_output_group_test(
    name = "hash_assets_exposes_assets_test",
    group = "assets",
    target = ":hashed",
)

require_output_group_test(
    name = "hash_assets_exposes_manifest_test",
    group = "asset_manifest",
    target = ":hashed",
)
