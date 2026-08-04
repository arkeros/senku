load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load(":defs.bzl", "DEPLOY_AFTER", "LB_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    # Every backend this routes to must already be running: a serverless NEG
    # names its Cloud Run service by string, and a NEG whose service does not
    # exist serves a bare 404 rather than failing, so a wrong order here is
    # silent. Derived from BACKENDS — see DEPLOY_AFTER in defs.bzl.
    deploy_after = DEPLOY_AFTER,
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
        "//apps/spaghetti-duel:defs",
        "//apps/table-for-two:defs",
        "//oci/cmd/registry:defs",
        "@terraform.bzl//:terraform",
    ],
)
