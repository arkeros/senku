load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "secrets",
    srcs = ["resolve.go"],
    importpath = "github.com/arkeros/senku/platform/kubernetes/secrets",
    visibility = ["//visibility:public"],
    deps = [
        "//base/json/jsonutil",
        "//base/json/pointer",
        "@io_k8s_api//core/v1:core",
    ],
)

go_test(
    name = "secrets_test",
    srcs = ["resolve_test.go"],
    deps = [
        ":secrets",
        "//platform/kubernetes/secrets/providers/env",
        "//platform/kubernetes/secrets/providers/file",
        "@io_k8s_api//core/v1:core",
    ],
)
