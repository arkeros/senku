load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("//devtools/build/react_component:_hash_assets.bzl", "hash_assets")
load("//devtools/build/react_component:asset_library.bzl", "asset_library")
load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

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

# End-to-end exercise of the `assets` attr on react_component: the
# generated Header.assets.ts must exist and type-check so Header.tsx's
# `import { logoUrl } from "./Header.assets"` resolves.
react_component(
    name = "Header",
    testonly = True,
    srcs = ["Header.tsx"],
    assets = ["logo.svg"],
)

build_test(
    name = "header_with_assets_build_test",
    targets = [":Header"],
)

# asset_library fixture: two icons bundled into a reusable TS module.
asset_library(
    name = "icons",
    testonly = True,
    srcs = glob(["icons/*.svg"]),
)

# Consumer imports saveUrl + trashUrl from ":icons", exercising the
# cross-target asset flow: react_component -> ts_dep -> asset_library_ts.
react_component(
    name = "Toolbar",
    testonly = True,
    srcs = ["Toolbar.tsx"],
    deps = [":icons"],
)

build_test(
    name = "asset_library_build_test",
    targets = [":Toolbar"],
)

require_output_group_test(
    name = "asset_library_exposes_assets_test",
    group = "assets",
    target = ":icons_hashed",
)
