load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# Pure game rules — no React, no StyleX, no DOM. Compiled through
# react_component only because that is the repo's TypeScript-to-ESM path;
# `_export_test` is off because this module exports a vocabulary, not a
# single component named after the target.
react_component(
    name = "rules",
    srcs = ["rules.ts"],
    _export_test = False,
    visibility = ["//apps/napkin-battle:__subpackages__"],
)

js_test(
    name = "rules_test",
    data = [":rules_ts"],
    entry_point = "rules_test.mjs",
)
