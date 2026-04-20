load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Home",
    srcs = ["Home.tsx"],
    i18n = glob(["Home.*.mf2.json"]),
    visibility = ["//examples/stylex:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:app_env_component",
        "//examples/stylex/ui/components/Button",
    ],
)
