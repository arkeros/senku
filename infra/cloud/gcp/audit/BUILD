load("@aspect_rules_py//py:defs.bzl", "py_binary", "py_library")
load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load(":defs.bzl", "AUDIT_DOCS", "PROJECT")

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    # Project-level audit config and log sinks — same reasoning as
    # //infra/cloud/gcp/ci: applied locally, never by CI.
    #
    # Tier 0 despite loading //infra/cloud/gcp/lb:defs.bzl. That import is
    # for `DEFAULT_404_BUCKET_NAME`, a *string* interpolated into a log
    # filter; nothing here needs the bucket to exist. A build dependency is
    # not a deploy dependency.
    bootstrap = True,
    docs = [google_provider(project = PROJECT)] + AUDIT_DOCS,
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

# Pre-merge / pre-apply check on log-match alert filters. Reads filters
# from the rendered main.tf.json (data dep) so it's always in sync with
# what tf_root would deploy. See validate_alerts.py module docstring.
py_binary(
    name = "validate_alerts",
    srcs = ["validate_alerts.py"],
    data = [":terraform"],
    visibility = ["//visibility:private"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [
        "//infra/cloud/gcp/lb:defs",
        "@terraform.bzl//:gcp",
        "@terraform.bzl//:terraform",
    ],
)

py_library(
    name = "audit",
    srcs = ["validate_alerts.py"],
    visibility = ["//:__subpackages__"],
)
