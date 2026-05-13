load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "wolfi-apk-extract_lib",
    srcs = ["main.go"],
    importpath = "github.com/arkeros/senku/devtools/build/tools/wolfi-apk-extract",
    visibility = ["//visibility:private"],
)

go_binary(
    name = "wolfi-apk-extract",
    embed = [":wolfi-apk-extract_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "wolfi-apk-extract_test",
    srcs = ["main_test.go"],
    embed = [":wolfi-apk-extract_lib"],
)
