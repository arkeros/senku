load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//examples/stylex:__pkg__"])

react_component(
    name = "Home",
    srcs = ["Home.tsx"],
    i18n = [
        "Home.ca.mf2.json",
        "Home.en.mf2.json",
        "Home.es.mf2.json",
        "Home.fr.mf2.json",
        "Home.ru.mf2.json",
    ],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:Button",
        "//examples/stylex:app_env_component",
    ],
)

react_component(
    name = "About",
    srcs = ["About.tsx"],
    i18n = [
        "About.ca.mf2.json",
        "About.en.mf2.json",
        "About.es.mf2.json",
        "About.fr.mf2.json",
        "About.ru.mf2.json",
    ],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//examples/stylex:tokens",
    ],
)

react_component(
    name = "NotFound",
    srcs = ["NotFound.tsx"],
    i18n = [
        "NotFound.ca.mf2.json",
        "NotFound.en.mf2.json",
        "NotFound.es.mf2.json",
        "NotFound.fr.mf2.json",
        "NotFound.ru.mf2.json",
    ],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//:node_modules/react-router",
        "//examples/stylex:tokens",
    ],
)
