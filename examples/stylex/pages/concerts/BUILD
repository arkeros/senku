load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//examples/stylex:__pkg__"])

react_component(
    name = "ConcertsHome",
    srcs = ["ConcertsHome.tsx"],
    i18n = glob(["ConcertsHome.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
    ],
)

react_component(
    name = "City",
    srcs = ["City.tsx"],
    i18n = glob(["City.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//examples/stylex:tokens",
    ],
)

react_component(
    name = "Trending",
    srcs = ["Trending.tsx"],
    i18n = glob(["Trending.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:tokens",
    ],
)
