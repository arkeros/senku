load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "jsonutil",
    srcs = ["scalar.go"],
    importpath = "github.com/arkeros/senku/base/json/jsonutil",
    visibility = ["//visibility:public"],
)

go_test(
    name = "jsonutil_test",
    srcs = ["scalar_test.go"],
    embed = [":jsonutil"],
)
