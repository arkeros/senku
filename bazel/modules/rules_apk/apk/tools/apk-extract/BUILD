load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "apk-extract_lib",
    srcs = ["main.go"],
    importpath = "github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/apk-extract",
    visibility = ["//visibility:private"],
    deps = [
        "@dev_chainguard_apko//pkg/apk/apk",
        "@dev_chainguard_apko//pkg/apk/expandapk",
        "@dev_chainguard_apko//pkg/apk/types",
    ],
)

go_binary(
    name = "apk-extract",
    embed = [":apk-extract_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "apk-extract_test",
    srcs = ["main_test.go"],
    embed = [":apk-extract_lib"],
)
