load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@rules_shell//shell:sh_test.bzl", "sh_test")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")

react_app(
    name = "app",
    browser_deps = [
        "//:browser_modules/_react",
        "//:browser_modules/react-router",
        "//:browser_modules/cookie",
        "//:browser_modules/set-cookie-parser",
        "//:browser_modules/@stylexjs/stylex",
        "//:browser_modules/messageformat",
        "//:browser_modules/@panellet/i18n-runtime",
    ],
    error_component = "//examples/stylex/components/AppError",
    html_template = "index.html.tpl",
    jit_open_props = True,
    layout = "//examples/stylex/components/Layout",
    locales = [
        "ca",
        "en",
        "es",
        "fr",
        "ru",
    ],
    routes = [
        route(
            component = "//examples/stylex/pages/Home",
            path = "/",
        ),
        route(
            component = "//examples/stylex/pages/About",
            error_component = "//examples/stylex/components/RouteError",
            path = "about",
        ),
        route(
            children = [
                route(
                    component = "//examples/stylex/pages/concerts/ConcertsHome",
                    error_component = "//examples/stylex/components/RouteError",
                    path = "/",
                ),
                route(
                    component = "//examples/stylex/pages/concerts/City",
                    path = ":city",
                ),
                route(
                    component = "//examples/stylex/pages/concerts/Trending",
                    path = "trending",
                ),
            ],
            path = "concerts",
        ),
        route(
            component = "//examples/stylex/pages/NotFound",
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
