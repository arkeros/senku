load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "apkdb-merge_lib",
    srcs = ["main.go"],
    importpath = "github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/apkdb-merge",
    visibility = ["//visibility:private"],
)

go_binary(
    name = "apkdb-merge",
    embed = [":apkdb-merge_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "apkdb-merge_test",
    srcs = ["main_test.go"],
    embed = [":apkdb-merge_lib"],
)
