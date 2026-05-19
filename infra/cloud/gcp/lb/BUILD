load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load(":defs.bzl", "LB_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    docs = [google_provider(project = PROJECT)] + LB_DOCS,
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "//oci/cmd/registry:defs",
        "@terraform.bzl//:terraform",
    ],
)
