load("//devtools/build/react_component:react_component.bzl", "react_component")

# Canvas drawing. Pure `ctx` calls driven by a World snapshot plus a Labels
# bag — no React, no i18n, and no rules beyond reading the field it is handed.
# Keeping the strings as an input is what lets the route component own every
# i18n call site.
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
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
    deps = [
        "//apps/pepper-sweeper/game:board",
        "//apps/pepper-sweeper/game:field",
        "//apps/pepper-sweeper/game:match",
    ],
)
