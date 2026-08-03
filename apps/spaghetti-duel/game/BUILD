load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# The whole rulebook: grid geometry, turning, one simultaneous move for every
# strand on the plate, collisions, meatball spawning and the match state
# machine. No canvas, no React, no DOM, and no clock — every function is a
# value in, value out, and randomness is injected rather than sampled here.
react_component(
    name = "rules",
    srcs = ["rules.ts"],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
)

js_test(
    name = "rules_test",
    data = [":rules_ts"],
    entry_point = "rules_test.mjs",
)

# Gesture arithmetic, kept out of `rules` because it is about fingers on
# glass rather than about the plate. Pure enough to test without a DOM: the
# component turns TouchEvents into two numbers and asks this which way that
# was, from the asking player's side of the table.
react_component(
    name = "swipe",
    srcs = ["swipe.ts"],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = [":rules"],
)

js_test(
    name = "swipe_test",
    data = [":swipe_ts"],
    entry_point = "swipe_test.mjs",
)
