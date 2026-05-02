load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("//devtools/build/react_component:_hash_assets.bzl", "hash_assets")
load("//devtools/build/react_component:asset_library.bzl", "asset_library")
load("//devtools/build/react_component:i18n_artifacts.bzl", "i18n_artifacts")
load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")
load("//devtools/build/react_component:react_ssr_app.bzl", "react_ssr_app")
load("//devtools/build/react_component:react_ssr_component.bzl", "react_ssr_component")

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

# i18n fixture: a component with per-locale MF2 catalog fragments. Locks in
# that react_component's `i18n` attr flows into the `i18n_catalog`
# OutputGroup that the aspect collects.
react_component(
    name = "I18nLeaf",
    testonly = True,
    srcs = ["I18nLeaf.tsx"],
    i18n = [
        "I18nLeaf.en.mf2.json",
        "I18nLeaf.es.mf2.json",
    ],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
    ],
)

require_output_group_test(
    name = "i18n_leaf_exposes_i18n_catalog_test",
    group = "i18n_catalog",
    target = ":I18nLeaf",
)

# Second i18n component — referenced via deps to exercise transitive collection.
react_component(
    name = "I18nLeafDep",
    testonly = True,
    srcs = ["I18nLeafDep.tsx"],
    i18n = [
        "I18nLeafDep.en.mf2.json",
        "I18nLeafDep.es.mf2.json",
    ],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
    ],
)

# End-to-end check of the aspect + merge + codegen + react_component wrapping.
# A build failure here means one of: aspect isn't collecting, merge is
# producing wrong outputs, codegen is emitting invalid TS, or the manifest
# component isn't type-checking against @types/react.
i18n_artifacts(
    name = "i18n_testapp",
    components = [
        ":I18nLeaf",
        ":I18nLeafDep",
    ],
    forward_kwargs = {"testonly": True},
    locales = [
        "en",
        "es",
    ],
    source_locale = "en",
)

build_test(
    name = "i18n_artifacts_build_test",
    targets = [":i18n_testapp_i18n_manifest"],
)

# react_ssr_app smoke fixture — exercises the server-bundle build today
# (roadmap step 4). Devserver + OCI image targets get added under this
# fixture in subsequent roadmap steps.
react_ssr_app(
    name = "ssr_smoke",
    testonly = True,
    browser_deps = [
        "//:browser_modules/_react",
        "//:browser_modules/react-router",
        "//:browser_modules/cookie",
        "//:browser_modules/set-cookie-parser",
    ],
    layout = ":SsrPage",
    routes = [],
)

build_test(
    name = "ssr_smoke_server_bundle_test",
    targets = [
        ":ssr_smoke_server_bundle",
        ":ssr_smoke_client_bundle",
        ":ssr_smoke_styles",
        ":ssr_smoke_normalize_css",
        ":ssr_smoke_static",
        ":ssr_smoke_devserver",
    ],
)

# react_ssr_component fixture: dual-compile a route component with
# `preload` and `meta` exports. Exercises that both .client.js and
# .server.js outputs are produced and that downstream consumers can
# reach them via the :SsrPage_client / :SsrPage_server filegroups.
react_ssr_component(
    name = "SsrPage",
    testonly = True,
    srcs = ["SsrPage.tsx"],
)

build_test(
    name = "ssr_component_build_test",
    targets = [
        ":SsrPage",
        ":SsrPage_client",
        ":SsrPage_server",
    ],
)
