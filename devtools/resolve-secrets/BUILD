load("@bazel_lib//lib:transitions.bzl", "platform_transition_filegroup")
load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "resolve-secrets_lib",
    srcs = ["main.go"],
    importpath = "github.com/arkeros/senku/devtools/resolve-secrets",
    visibility = ["//visibility:private"],
    deps = [
        "//platform/kubernetes/secrets",
        "//platform/kubernetes/secrets/providers/env",
        "//platform/kubernetes/secrets/providers/file",
        "//platform/kubernetes/secrets/providers/gcp",
        "@io_k8s_api//core/v1:core",
        "@io_k8s_apimachinery//pkg/apis/meta/v1:meta",
        "@io_k8s_apimachinery//pkg/runtime",
        "@io_k8s_apimachinery//pkg/util/yaml",
        "@io_k8s_sigs_yaml//:yaml",
    ],
)

go_binary(
    name = "resolve-secrets",
    embed = [":resolve-secrets_lib"],
    visibility = ["//visibility:public"],
)

PLATFORMS = {
    "linux-amd64": "@rules_go//go/toolchain:linux_amd64",
    "linux-arm64": "@rules_go//go/toolchain:linux_arm64",
    "darwin-amd64": "@rules_go//go/toolchain:darwin_amd64",
    "darwin-arm64": "@rules_go//go/toolchain:darwin_arm64",
}

[
    platform_transition_filegroup(
        name = "resolve-secrets-" + platform,
        srcs = [":resolve-secrets"],
        target_platform = label,
    )
    for platform, label in PLATFORMS.items()
]

go_test(
    name = "resolve-secrets_test",
    srcs = ["main_test.go"],
    data = glob(["testdata/**"]),
    embed = [":resolve-secrets_lib"],
    deps = [
        "//platform/kubernetes/secrets",
        "//platform/kubernetes/secrets/providers/mem",
        "//testing/golden",
    ],
)
