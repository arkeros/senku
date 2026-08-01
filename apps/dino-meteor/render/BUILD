load("//devtools/build/react_component:react_component.bzl", "react_component")

# Canvas drawing. Pure `ctx` calls driven by a World snapshot plus a Labels
# bag — no React, no i18n, no game rules. Keeping the strings as an input is
# what lets the route component own every i18n call site.
react_component(
    name = "scene",
    srcs = [
        "palette.ts",
        "scene.ts",
    ],
    _export_test = False,
    visibility = ["//apps/dino-meteor:__subpackages__"],
    deps = ["//apps/dino-meteor/game:rules"],
)
