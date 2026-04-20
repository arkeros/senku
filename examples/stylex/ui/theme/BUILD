load("//devtools/build/react_component:output_group_test.bzl", "require_output_group_test")
load("//devtools/build/react_component:stylex_library.bzl", "stylex_library")

stylex_library(
    name = "tokens",
    srcs = ["tokens.stylex.ts"],
    visibility = ["//examples/stylex:__subpackages__"],
)

require_output_group_test(
    name = "tokens_stylex_output_group_test",
    group = "stylex_metadata",
    target = ":tokens",
)
