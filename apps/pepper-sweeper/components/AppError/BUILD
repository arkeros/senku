load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "AppError",
    srcs = ["AppError.tsx"],
    i18n = glob(["AppError.*.mf2.json"]),
    visibility = ["//apps/pepper-sweeper:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//apps/pepper-sweeper/ui/theme:tokens",
    ],
)
