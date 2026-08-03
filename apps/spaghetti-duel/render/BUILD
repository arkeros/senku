load("//devtools/build/react_component:react_component.bzl", "react_component")

# Canvas drawing. Pure `ctx` calls driven by a World snapshot plus a Labels
# bag — no React, no i18n, no game rules. Keeping the strings as an input is
# what lets the route component own every i18n call site.
#
# It also owns `modeButtons`, the geometry of the two title-card buttons: a
# canvas has nothing to click, so the drawn shape and the tappable rectangle
# have to come from the same place.
react_component(
    name = "scene",
    srcs = [
        "palette.ts",
        "scene.ts",
    ],
    _export_test = False,
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = ["//apps/spaghetti-duel/game:rules"],
)
