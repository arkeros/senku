load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "apkformat",
    srcs = [
        "multigz.go",
        "signature.go",
    ],
    importpath = "github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/internal/apkformat",
    visibility = ["//apk/tools:__subpackages__"],
)

go_test(
    name = "apkformat_test",
    srcs = [
        "multigz_test.go",
        "signature_test.go",
    ],
    embed = [":apkformat"],
)
