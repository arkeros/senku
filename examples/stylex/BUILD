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
    i18n = [
        "Layout.ca.mf2.json",
        "Layout.en.mf2.json",
        "Layout.es.mf2.json",
        "Layout.fr.mf2.json",
        "Layout.ru.mf2.json",
    ],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
        "//devtools/build/react_component/i18n_runtime",
    ],
)

react_component(
    name = "AppError",
    srcs = ["AppError.tsx"],
    i18n = [
        "AppError.ca.mf2.json",
        "AppError.en.mf2.json",
        "AppError.es.mf2.json",
        "AppError.fr.mf2.json",
        "AppError.ru.mf2.json",
    ],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
        "//devtools/build/react_component/i18n_runtime",
    ],
)

react_component(
    name = "RouteError",
    srcs = ["RouteError.tsx"],
    i18n = [
        "RouteError.ca.mf2.json",
        "RouteError.en.mf2.json",
        "RouteError.es.mf2.json",
        "RouteError.fr.mf2.json",
        "RouteError.ru.mf2.json",
    ],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
        "//devtools/build/react_component/i18n_runtime",
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
        "//devtools/build/js:messageformat",
    ],
    error_component = ":AppError",
    html_template = "index.html.tpl",
    jit_open_props = True,
    layout = ":Layout",
    locales = [
        "ca",
        "en",
        "es",
        "fr",
        "ru",
    ],
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
                    error_component = ":RouteError",
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
    runtime_config = {
        "API_URL": "http://localhost:8080",
    },
    source_locale = "en",
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
        ":app_env_tpl",
        ":app_env_dev",
        ":app_env_component",
    ],
)

sh_test(
    name = "app_test",
    srcs = ["app_test.sh"],
    data = [
        ":app_assets",
        ":app_assets.json",
        ":app_bundle",
        ":app_env_dev",
        ":app_env_tpl",
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
