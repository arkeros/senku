load("@rules_go//go:def.bzl", "go_library")

go_library(
    name = "updatesnapshots",
    srcs = ["updatesnapshots.go"],
    importpath = "github.com/arkeros/senku/bazel/cmd/knife/cmd/updatesnapshots",
    visibility = ["//bazel/cmd/knife:__subpackages__"],
    deps = [
        "//distroless/pkg/snapshot",
        "@com_github_spf13_cobra//:cobra",
    ],
)
