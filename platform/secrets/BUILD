load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "secrets",
    srcs = ["fetch.go"],
    importpath = "github.com/arkeros/senku/platform/secrets",
    visibility = ["//visibility:public"],
    deps = [
        "//base/json/jsonutil",
        "//base/json/pointer",
    ],
)

go_test(
    name = "secrets_test",
    srcs = ["fetch_test.go"],
    deps = [":secrets"],
)
