load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "ConcertsHome",
    srcs = ["ConcertsHome.tsx"],
    i18n = glob(["ConcertsHome.*.mf2.json"]),
    visibility = ["//examples/stylex:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
    ],
)
