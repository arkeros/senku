load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Button",
    srcs = ["Button.tsx"],
    visibility = ["//examples/stylex:__subpackages__"],
    deps = ["//examples/stylex/ui/theme:tokens"],
)

require_output_group_test(
    name = "button_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":Button",
)
