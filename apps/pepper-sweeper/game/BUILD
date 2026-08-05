load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# Grid geometry: how a viewport is cut into a board, how a resize is absorbed,
# and which cell a pixel belongs to. Knows nothing about peppers — the two
# modes hand it the shape they want and it hands back a grid.
react_component(
    name = "board",
    srcs = ["board.ts"],
    _export_test = False,
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
)

js_test(
    name = "board_test",
    data = [":board_ts"],
    entry_point = "board_test.mjs",
)

# The minefield itself: where the peppers are, what each tile is showing, and
# every way a tile changes — reveal and its flood, flags, chording, and the
# duel's pick. No canvas, no clock, and randomness is injected rather than
# sampled, so the deducible half of the game is testable without a browser.
react_component(
    name = "field",
    srcs = ["field.ts"],
    _export_test = False,
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
)

js_test(
    name = "field_test",
    data = [":field_ts"],
    entry_point = "field_test.mjs",
)

# The match state machine: whose go it is, how many peppers each side has, and
# what ends a game. Also owns the two modes' board shapes and pepper counts,
# which is where the duel's "five of nine" guarantee is written down.
react_component(
    name = "match",
    srcs = ["match.ts"],
    _export_test = False,
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
    deps = [
        ":board",
        ":field",
    ],
)

js_test(
    name = "match_test",
    data = [":match_ts"],
    entry_point = "match_test.mjs",
)

# What a press means. Kept out of the component because a long press is the
# one gesture with no browser event of its own — it has to be timed by hand,
# and out here the timing is a pure function a test can pin down.
react_component(
    name = "input",
    srcs = ["input.ts"],
    _export_test = False,
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
    deps = [":match"],
)

js_test(
    name = "input_test",
    data = [":input_ts"],
    entry_point = "input_test.mjs",
)
