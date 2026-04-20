load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "About",
    srcs = ["About.tsx"],
    i18n = glob(["About.*.mf2.json"]),
    visibility = ["//examples/stylex:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex/ui/theme:tokens",
    ],
)
