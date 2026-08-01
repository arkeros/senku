load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# Pure arena physics — field geometry, paddle clamping, wall bounces,
# paddle collisions, serve. No canvas, no React, no DOM, and no clock:
# every function is a value in, value out, so the whole rulebook is
# testable without a browser. Randomness is injected, never sampled here.
react_component(
    name = "rules",
    srcs = ["rules.ts"],
    _export_test = False,
    visibility = ["//apps/dino-meteor:__subpackages__"],
)

js_test(
    name = "rules_test",
    data = [":rules_ts"],
    entry_point = "rules_test.mjs",
)
