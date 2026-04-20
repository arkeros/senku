load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//examples/stylex:__pkg__"])

react_component(
    name = "Home",
    srcs = ["Home.tsx"],
    i18n = glob(["Home.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:Button",
        "//examples/stylex:app_env_component",
    ],
)

react_component(
    name = "About",
    srcs = ["About.tsx"],
    i18n = glob(["About.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:tokens",
    ],
)

react_component(
    name = "NotFound",
    srcs = ["NotFound.tsx"],
    i18n = glob(["NotFound.*.mf2.json"]),
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//examples/stylex:tokens",
    ],
)
