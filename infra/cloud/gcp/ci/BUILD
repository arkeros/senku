load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load(":defs.bzl", "CI_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    # This root provisions the WIF binding and project IAM that CI's own
    # service account depends on, so CI must never apply it: a botched
    # apply could revoke the SA's permissions and leave CI unable to
    # recover. `aspect` skips it under $CI and walks it locally.
    bootstrap = True,
    docs = [google_provider(project = PROJECT)] + CI_DOCS,
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "@terraform.bzl//:gcp",
        "@terraform.bzl//:terraform",
    ],
)
