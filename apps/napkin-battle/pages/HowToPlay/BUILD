load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "HowToPlay",
    srcs = ["HowToPlay.tsx"],
    i18n = glob(["HowToPlay.*.mf2.json"]),
    visibility = ["//apps/napkin-battle:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//apps/napkin-battle/ui/theme:tokens",
    ],
)
