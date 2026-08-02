load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Play",
    srcs = ["Play.tsx"],
    i18n = glob(["Play.*.mf2.json"]),
    visibility = ["//apps/dino-meteor:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//apps/dino-meteor/render:scene",
        "//apps/dino-meteor/ui/components/Arena",
    ],
)
