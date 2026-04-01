load("@rules_go//go:def.bzl", "go_library", "go_test")

go_library(
    name = "v1alpha1",
    srcs = ["types.go"],
    importpath = "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1",
    visibility = ["//visibility:public"],
    deps = [
        "@io_k8s_api//core/v1:core",
        "@io_k8s_apimachinery//pkg/api/resource",
        "@io_k8s_sigs_yaml//:yaml",
    ],
)

go_test(
    name = "v1alpha1_test",
    srcs = ["types_test.go"],
    embed = [":v1alpha1"],
    deps = [
        "@io_k8s_api//core/v1:core",
        "@io_k8s_apimachinery//pkg/api/resource",
    ],
)
