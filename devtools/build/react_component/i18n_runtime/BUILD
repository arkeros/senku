load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//visibility:public"])

# Shared i18n runtime: MessageFormat v4 wrapper exposing <I18nProvider>,
# <Trans>, and useI18n. Consumers import via relative path from their own
# package and depend on this target.
react_component(
    name = "i18n_runtime",
    srcs = ["index.tsx"],
    _export_test = False,
    deps = [
        "//:node_modules/messageformat",
    ],
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
