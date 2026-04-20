load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "RouteError",
    srcs = ["RouteError.tsx"],
    i18n = glob(["RouteError.*.mf2.json"]),
    visibility = ["//examples/stylex:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//examples/stylex/ui/theme:tokens",
    ],
)
