load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Button",
    srcs = ["Button.tsx"],
    visibility = ["//examples/stylex/pages:__subpackages__"],
)

react_component(
    name = "Layout",
    srcs = ["Layout.tsx"],
    deps = ["//:node_modules/react-router"],
)

react_app(
    name = "app",
    browser_deps = [
        "//devtools/build/js:react",
        "//devtools/build/js:react_router",
        "//devtools/build/js:cookie",
        "//devtools/build/js:set_cookie_parser",
        "//devtools/build/js:stylex",
    ],
    components = [":Button"],
    layout = ":Layout",
    routes = [
        route(
            component = "//examples/stylex/pages:Home",
            path = "/",
        ),
        route(
            component = "//examples/stylex/pages:About",
            path = "about",
        ),
        route(
            children = [
                route(
                    component = "//examples/stylex/pages/concerts:ConcertsHome",
                    path = "/",
                ),
                route(
                    component = "//examples/stylex/pages/concerts:City",
                    path = ":city",
                ),
                route(
                    component = "//examples/stylex/pages/concerts:Trending",
                    path = "trending",
                ),
            ],
            path = "concerts",
        ),
    ],
)

build_test(
    name = "stylex_test",
    targets = [
        ":Button",
        ":Layout",
        ":app_bundle",
        ":app_styles",
        ":app_html",
        ":app_devserver",
    ],
)
