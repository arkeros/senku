load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@aspect_rules_js//npm:defs.bzl", "npm_package")
load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//visibility:public"])

# Shared i18n runtime: MessageFormat v4 wrapper exposing <I18nProvider>,
# <Trans>, and useI18n. Distributed as a first-party npm package
# `@panallet/i18n-runtime` so consumers (including non-root bzlmod consumers
# of @senku) can import it via standard npm resolution rather than a
# relative path that only works inside this monorepo.
react_component(
    name = "i18n_runtime",
    srcs = ["index.tsx"],
    _export_test = False,
    deps = [
        "//:node_modules/messageformat",
    ],
)

# Wraps the compiled JS + DTS + package.json as an npm-shaped tree so
# consumers can `npm_link_package(name = "node_modules/@panallet/i18n-runtime",
# src = "@senku//devtools/build/react_component/i18n_runtime:pkg")` from
# their root BUILD.
npm_package(
    name = "pkg",
    srcs = [
        "package.json",
        # The ts_project target carries JsInfo with both .js and .d.ts —
        # the public :i18n_runtime artifact_outputs target only re-exposes
        # the .js, which is enough at runtime but leaves consumers without
        # type info.
        ":i18n_runtime_ts",
    ],
    package = "@panallet/i18n-runtime",
    visibility = ["//visibility:public"],
)

# Pins messageformat v4's MF2 behavior. If a version bump changes plural
# resolution or parse syntax, this test catches it before panallet builds do.
js_test(
    name = "messageformat_smoke_test",
    data = [
        "messageformat_smoke_test.mjs",
        "//:node_modules/messageformat",
    ],
    entry_point = "messageformat_smoke_test.mjs",
)
