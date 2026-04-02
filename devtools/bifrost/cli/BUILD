load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "cli_lib",
    srcs = [
        "main.go",
        "render.go",
    ],
    importpath = "github.com/arkeros/senku/devtools/bifrost/cli",
    visibility = ["//visibility:private"],
    deps = [
        "//devtools/bifrost/api",
        "@com_github_hashicorp_hcl_v2//:hcl",
        "@com_github_hashicorp_hcl_v2//hclwrite",
        "@com_github_zclconf_go_cty//cty",
        "@dev_knative_serving//pkg/apis/serving/v1:serving",
        "@io_k8s_api//apps/v1:apps",
        "@io_k8s_api//autoscaling/v2:autoscaling",
        "@io_k8s_api//batch/v1:batch",
        "@io_k8s_api//core/v1:core",
        "@io_k8s_apimachinery//pkg/apis/meta/v1:meta",
        "@io_k8s_apimachinery//pkg/util/intstr",
        "@io_k8s_sigs_yaml//:yaml",
    ],
)

go_binary(
    name = "cli",
    embed = [":cli_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "cli_test",
    srcs = ["bifrost_test.go"],
    data = glob(["testdata/**"]),
    embed = [":cli_lib"],
    deps = ["//devtools/bifrost/api"],
)
