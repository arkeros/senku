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
# was, and which half of the glass the hand landed on.
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

# What a key press means, kept beside `swipe` for the same reason: it is
# about the hands rather than the plate. Out of the component because the
# keyboard is the one input a test can state exhaustively — every seat can
# steer, and every mode can be started.
react_component(
    name = "keys",
    srcs = ["keys.ts"],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = [
        ":bot",
        ":rules",
    ],
)

js_test(
    name = "keys_test",
    data = [
        ":bot_ts",
        ":keys_ts",
        ":rules_ts",
    ],
    entry_point = "keys_test.mjs",
)

# The bot: a third controller beside `swipe` and `keys`, and kept there for the
# same reason. It hands back a heading and the caller spends it through `turn`,
# so the rulebook never learns that one of its strands is artificial — see
# ADR 0001. Unlike its two siblings it depends on `rules` at runtime rather
# than for types alone, because deciding a move means walking the board.
react_component(
    name = "bot",
    srcs = ["bot.ts"],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = [":rules"],
)

js_test(
    name = "bot_test",
    data = [
        ":bot_ts",
        ":rules_ts",
    ],
    entry_point = "bot_test.mjs",
)
