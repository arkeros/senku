load("@aspect_rules_py//py:defs.bzl", "py_binary", "py_library")
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
        "//devtools/build/tools/tf:defs",
        "//devtools/build/tools/tf/resources:gcp",
        "//infra/cloud/gcp/lb:defs",
    ],
)

py_library(
    name = "audit",
    srcs = ["validate_alerts.py"],
    visibility = ["//:__subpackages__"],
)
