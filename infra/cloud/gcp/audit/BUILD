load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("//devtools/build/tools/tf:defs.bzl", "tf_root")
load("//devtools/build/tools/tf/resources:gcp.bzl", "google_provider")
load(":defs.bzl", "AUDIT_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    docs = [google_provider(project = PROJECT)] + AUDIT_DOCS,
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "//devtools/build/tools/tf:defs",
        "//devtools/build/tools/tf/resources:gcp",
        "//infra/cloud/gcp/lb:defs",
    ],
)
