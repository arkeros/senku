load("@rules_go//go:def.bzl", "go_binary", "go_library", "go_test")

go_library(
    name = "tf_pr_comment_lib",
    srcs = [
        "main.go",
        "render.go",
    ],
    importpath = "github.com/arkeros/senku/devtools/build/tools/tf_pr_comment",
    visibility = ["//visibility:private"],
    deps = ["@com_github_google_go_github_v85//github"],
)

go_binary(
    name = "tf_pr_comment",
    embed = [":tf_pr_comment_lib"],
    visibility = ["//visibility:public"],
)

go_test(
    name = "tf_pr_comment_test",
    srcs = [
        "main_test.go",
        "render_test.go",
    ],
    embed = [":tf_pr_comment_lib"],
    deps = ["@com_github_google_go_github_v85//github"],
)
