load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//examples/stylex:__pkg__"])

react_component(
    name = "ConcertsHome",
    srcs = ["ConcertsHome.tsx"],
    i18n = [
        "ConcertsHome.ca.mf2.json",
        "ConcertsHome.en.mf2.json",
        "ConcertsHome.es.mf2.json",
        "ConcertsHome.fr.mf2.json",
        "ConcertsHome.ru.mf2.json",
    ],
    deps = [
        "//:node_modules/react-router",
        "//devtools/build/react_component/i18n_runtime",
    ],
)

react_component(
    name = "City",
    srcs = ["City.tsx"],
    i18n = [
        "City.ca.mf2.json",
        "City.en.mf2.json",
        "City.es.mf2.json",
        "City.fr.mf2.json",
        "City.ru.mf2.json",
    ],
    deps = [
        "//:node_modules/react-router",
        "//devtools/build/react_component/i18n_runtime",
        "//examples/stylex:tokens",
    ],
)

react_component(
    name = "Trending",
    srcs = ["Trending.tsx"],
    i18n = [
        "Trending.ca.mf2.json",
        "Trending.en.mf2.json",
        "Trending.es.mf2.json",
        "Trending.fr.mf2.json",
        "Trending.ru.mf2.json",
    ],
    deps = [
        "//devtools/build/react_component/i18n_runtime",
        "//examples/stylex:tokens",
    ],
)
