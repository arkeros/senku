load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "snapshot",
    srcs = [
        "fetch.go",
        "snapshot.go",
    ],
    importpath = "github.com/arkeros/senku/distroless/pkg/snapshot",
    visibility = ["//visibility:public"],
    deps = [
        "@in_yaml_go_yaml_v4//:yaml",
    ],
)

go_test(
    name = "snapshot_test",
    srcs = ["snapshot_test.go"],
    embed = [":snapshot"],
)
