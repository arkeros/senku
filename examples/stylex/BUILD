load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@rules_shell//shell:sh_test.bzl", "sh_test")
load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_component.bzl", "react_component")
load("//devtools/build/react_component:stylex_library.bzl", "stylex_library")

stylex_library(
    name = "tokens",
    srcs = ["tokens.stylex.ts"],
    visibility = ["//examples/stylex:__subpackages__"],
)

react_component(
    name = "Button",
    srcs = ["Button.tsx"],
    visibility = ["//examples/stylex/pages:__subpackages__"],
    deps = [":tokens"],
)

react_component(
    name = "Layout",
    srcs = ["Layout.tsx"],
    assets = ["panallet_logo.png"],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
    ],
)

react_component(
    name = "AppError",
    srcs = ["AppError.tsx"],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
    ],
)

react_component(
    name = "RouteError",
    srcs = ["RouteError.tsx"],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
    ],
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
    error_component = ":AppError",
    html_template = "index.html.tpl",
    jit_open_props = True,
    layout = ":Layout",
    routes = [
        route(
            component = "//examples/stylex/pages:Home",
            path = "/",
        ),
        route(
            component = "//examples/stylex/pages:About",
            error_component = ":RouteError",
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
        route(
            component = "//examples/stylex/pages:NotFound",
            path = "*",
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

sh_test(
    name = "app_test",
    srcs = ["app_test.sh"],
    data = [
        ":app_assets",
        ":app_assets.json",
        ":app_html",
        ":app_main_ts",
        ":app_router_ts",
        ":app_styles",
    ],
)

# Locks in that react_component exposes StyleX metadata via OutputGroupInfo —
# the generic path that asset collection and other build-time metadata share.
require_output_group_test(
    name = "button_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":Button",
)

require_output_group_test(
    name = "tokens_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":tokens",
)
