load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "env",
    srcs = ["env.go"],
    importpath = "github.com/arkeros/senku/platform/kubernetes/secrets/providers/env",
    visibility = ["//visibility:public"],
)

go_test(
    name = "env_test",
    srcs = ["env_test.go"],
    embed = [":env"],
)
