load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "bifrost_lib",
    srcs = [
        "main.go",
        "render.go",
    ],
    importpath = "github.com/arkeros/senku/bifrost/cmd/bifrost",
    visibility = ["//visibility:private"],
    deps = [
        "//bifrost/pkg/api/v1alpha1",
        "@com_github_hashicorp_hcl_v2//:hcl",
        "@com_github_hashicorp_hcl_v2//hclsyntax",
        "@com_github_hashicorp_hcl_v2//hclwrite",
        "@com_github_zclconf_go_cty//cty",
        "@dev_knative_serving//pkg/apis/serving/v1:serving",
        "@io_k8s_api//apps/v1:apps",
        "@io_k8s_api//autoscaling/v2:autoscaling",
        "@io_k8s_api//core/v1:core",
        "@io_k8s_apimachinery//pkg/apis/meta/v1:meta",
        "@io_k8s_apimachinery//pkg/util/intstr",
        "@io_k8s_sigs_yaml//:yaml",
    ],
)

go_binary(
    name = "bifrost",
    embed = [":bifrost_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "bifrost_test",
    srcs = ["bifrost_test.go"],
    embed = [":bifrost_lib"],
    deps = ["//bifrost/pkg/api/v1alpha1"],
)
