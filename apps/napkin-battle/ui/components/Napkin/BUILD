load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Napkin",
    srcs = ["Napkin.tsx"],
    visibility = ["//apps/napkin-battle:__subpackages__"],
    deps = ["//apps/napkin-battle/ui/theme:tokens"],
)

require_output_group_test(
    name = "napkin_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":Napkin",
)
