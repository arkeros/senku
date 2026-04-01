load("@rules_go//go:def.bzl", "go_library")

go_library(
    name = "debversions",
    srcs = ["debversions.go"],
    importpath = "github.com/arkeros/senku/bazel/cmd/knife/cmd/debversions",
    visibility = ["//bazel/cmd/knife:__subpackages__"],
    deps = [
        "//distroless/pkg/lockfile",
        "@com_github_spf13_cobra//:cobra",
    ],
)
