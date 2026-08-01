load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Play",
    srcs = ["Play.tsx"],
    i18n = glob(["Play.*.mf2.json"]),
    visibility = ["//apps/napkin-battle:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//apps/napkin-battle/game:rules",
        "//apps/napkin-battle/ui/components/Bill",
        "//apps/napkin-battle/ui/components/Cell",
        "//apps/napkin-battle/ui/components/Napkin",
        "//apps/napkin-battle/ui/components/Tile",
        "//apps/napkin-battle/ui/theme:tokens",
    ],
)
