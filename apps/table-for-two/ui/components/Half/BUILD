load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Half",
    srcs = ["Half.tsx"],
    visibility = ["//apps/table-for-two:__subpackages__"],
    deps = [
        "//apps/table-for-two/game:rules",
        "//apps/table-for-two/ui/theme:tokens",
    ],
)

require_output_group_test(
    name = "half_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":Half",
)
