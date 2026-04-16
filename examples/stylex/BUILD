load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@rules_shell//shell:sh_test.bzl", "sh_test")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "tokens",
    srcs = ["tokens.stylex.ts"],
    _export_test = False,
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
    deps = ["//:node_modules/react-router"],
)

genrule(
    name = "open_props_css",
    srcs = ["//:node_modules/open-props"],
    outs = ["open-props.css"],
    cmd = "cp $$(find $(locations //:node_modules/open-props) -name 'open-props.min.css' | head -1) $@",
)

react_app(
    name = "app",
    base_css = [":open_props_css"],
    browser_deps = [
        "//devtools/build/js:react",
        "//devtools/build/js:react_router",
        "//devtools/build/js:cookie",
        "//devtools/build/js:set_cookie_parser",
        "//devtools/build/js:stylex",
    ],
    html_template = "index.html.tpl",
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

sh_test(
    name = "app_test",
    srcs = ["app_test.sh"],
    data = [
        ":app_html",
        ":app_main_ts",
        ":app_router_ts",
        ":app_styles",
    ],
)
