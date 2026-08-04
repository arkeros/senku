load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load(":defs.bzl", "LB_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    # No `deploy_after`. Every backend this routes to must already be running
    # — a serverless NEG names its Cloud Run service by string, and a NEG
    # whose service does not exist serves a bare 404 rather than failing — and
    # those names are `ref()`s, so the edges come from the references
    # themselves. `aspect dag` shows the result.
    docs = [google_provider(project = PROJECT)] + LB_DOCS,
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "//apps/cluedo-bayes:defs",
        "//apps/dino-meteor:defs",
        "//apps/napkin-battle:defs",
        "//apps/pepper-sweeper:defs",
        "//apps/spaghetti-duel:defs",
        "//apps/table-for-two:defs",
        "//oci/cmd/registry:defs",
        "@terraform.bzl//:terraform",
    ],
)
