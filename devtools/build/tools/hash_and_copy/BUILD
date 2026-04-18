load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "hash_and_copy_lib",
    srcs = ["main.go"],
    importpath = "github.com/arkeros/senku/devtools/build/tools/hash_and_copy",
    visibility = ["//visibility:private"],
)

go_binary(
    name = "hash_and_copy",
    embed = [":hash_and_copy_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "hash_and_copy_test",
    srcs = ["main_test.go"],
    embed = [":hash_and_copy_lib"],
)
