load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "tfgen_lib",
    srcs = [
        "generator.go",
        "main.go",
    ],
    importpath = "github.com/arkeros/senku/tools/cmd/tfgen",
    visibility = ["//visibility:private"],
    deps = [
        "@dev_knative_serving//pkg/apis/serving/v1:serving",
        "@in_yaml_go_yaml_v4//:yaml",
    ],
)

go_binary(
    name = "tfgen",
    embed = [":tfgen_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "tfgen_test",
    srcs = ["generator_test.go"],
    embed = [":tfgen_lib"],
)
