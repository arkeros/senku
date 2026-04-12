load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "file",
    srcs = ["file.go"],
    importpath = "github.com/arkeros/senku/platform/kubernetes/secrets/providers/file",
    visibility = ["//visibility:public"],
)

go_test(
    name = "file_test",
    srcs = ["file_test.go"],
    embed = [":file"],
)
