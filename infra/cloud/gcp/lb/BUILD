load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@bazel_skylib//rules:diff_test.bzl", "diff_test")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load("@jq.bzl//jq:jq.bzl", "jq")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "tf_root")
load("@yq.bzl//yq:yq.bzl", "yq")
load(":defs.bzl", "DISTROLESS_REGIONS", "DISTROLESS_SERVICES", "LB_DOCS", "PROJECT")

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
        "@terraform.bzl//:terraform",
    ],
)

# --- distroless.io reference checks -------------------------------------------
# The `registry` and `web` backends are literals copied from files that live in
# github.com/arkeros/distroless (see //bazel/include:distroless.MODULE.bazel).
# These tests diff each literal against the pinned original, so drift over
# there — a new region, a renamed service — fails here rather than shipping a
# serverless NEG that names a service which does not exist.
[
    (
        jq(
            name = "distroless_%s_regions_pinned" % svc,
            srcs = ["@distroless_%s_regions//file" % svc],
            out = "distroless_%s_regions_pinned.json" % svc,
            args = ["-c"],
            filter = "sort",
        ),
        write_file(
            name = "distroless_%s_regions_declared" % svc,
            out = "distroless_%s_regions_declared.json" % svc,
            content = [
                json.encode(sorted(DISTROLESS_REGIONS)),
                "",
            ],
        ),
        diff_test(
            name = "distroless_%s_regions_test" % svc,
            failure_message = "DISTROLESS_REGIONS in defs.bzl no longer matches the pinned regions.json for `%s`. Update the literal, or bump the pin in //bazel/include:distroless.MODULE.bazel." % svc,
            file1 = ":distroless_%s_regions_declared" % svc,
            file2 = ":distroless_%s_regions_pinned" % svc,
        ),
        yq(
            name = "distroless_%s_name_pinned" % svc,
            srcs = ["@distroless_%s_service//file" % svc],
            outs = ["distroless_%s_name_pinned.txt" % svc],
            expression = ".metadata.name",
        ),
        write_file(
            name = "distroless_%s_name_declared" % svc,
            out = "distroless_%s_name_declared.txt" % svc,
            content = [
                DISTROLESS_SERVICES[svc],
                "",
            ],
        ),
        diff_test(
            name = "distroless_%s_name_test" % svc,
            failure_message = "DISTROLESS_SERVICES[%r] in defs.bzl no longer matches metadata.name in the pinned service.yaml. A NEG naming a service that does not exist serves a bare 404 — fix the literal, or bump the pin." % svc,
            file1 = ":distroless_%s_name_declared" % svc,
            file2 = ":distroless_%s_name_pinned" % svc,
        ),
    )
    for svc in DISTROLESS_SERVICES.keys()
]
