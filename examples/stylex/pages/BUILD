load("//devtools/build/react_component:react_component.bzl", "react_component")

package(default_visibility = ["//examples/stylex:__pkg__"])

react_component(
    name = "Home",
    srcs = ["Home.tsx"],
    deps = [
        "//examples/stylex:Button",
        "//examples/stylex:app_env_component",
    ],
)

react_component(
    name = "About",
    srcs = ["About.tsx"],
    deps = ["//examples/stylex:tokens"],
)

react_component(
    name = "NotFound",
    srcs = ["NotFound.tsx"],
    deps = [
        "//:node_modules/react-router",
        "//examples/stylex:tokens",
    ],
)
