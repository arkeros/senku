load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# Canvas drawing. Pure `ctx` calls driven by a World snapshot plus a Labels
# bag — no React, no i18n, no game rules. Keeping the strings as an input is
# what lets the route component own every i18n call site.
#
# It also owns `modeButtons` and `personaRows`, the geometry of the title
# card's three buttons and the roster's five: a canvas has nothing to click,
# so the drawn shape and the tappable rectangle have to come from the same
# place.
react_component(
    name = "scene",
    srcs = [
        "palette.ts",
        "scene.ts",
    ],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = [
        "//apps/spaghetti-duel/game:bot",
        "//apps/spaghetti-duel/game:keys",
        "//apps/spaghetti-duel/game:rules",
    ],
)

# The geometry only — where the buttons, the roster rows and the score cards
# go. No `ctx` is involved and none is needed: this is the part of drawing
# that has a right answer, and it is where the bot's score card was found
# sitting on top of the near player's.
js_test(
    name = "scene_test",
    data = [
        ":scene_ts",
        "//apps/spaghetti-duel/game:bot_ts",
        "//apps/spaghetti-duel/game:rules_ts",
    ],
    entry_point = "scene_test.mjs",
)
