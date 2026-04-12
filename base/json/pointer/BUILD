load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "pointer",
    srcs = [
        "pointer.go",
        "token.go",
    ],
    importpath = "github.com/arkeros/senku/base/json/pointer",
    visibility = ["//visibility:public"],
)

go_test(
    name = "pointer_test",
    srcs = ["pointer_test.go"],
    embed = [":pointer"],
)
