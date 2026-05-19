load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "apkkey",
    srcs = ["apkkey.go"],
    importpath = "github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/internal/apkkey",
    visibility = ["//apk/tools:__subpackages__"],
)

go_test(
    name = "apkkey_test",
    srcs = ["apkkey_test.go"],
    embed = [":apkkey"],
)
