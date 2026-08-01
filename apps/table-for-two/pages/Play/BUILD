load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Play",
    srcs = ["Play.tsx"],
    i18n = glob(["Play.*.mf2.json"]),
    visibility = ["//apps/table-for-two:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//apps/table-for-two/game:rules",
        "//apps/table-for-two/ui/components/Half",
        "//apps/table-for-two/ui/components/Ticket",
        "//apps/table-for-two/ui/theme:tokens",
    ],
)
