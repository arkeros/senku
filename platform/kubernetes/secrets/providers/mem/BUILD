load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "mem",
    srcs = ["mem.go"],
    importpath = "github.com/arkeros/senku/platform/kubernetes/secrets/providers/mem",
    visibility = ["//visibility:public"],
)

go_test(
    name = "mem_test",
    srcs = ["mem_test.go"],
    embed = [":mem"],
)
