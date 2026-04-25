"""CI bootstrap: WIF pool/provider, GitHub Actions SA, Bazel remote cache, IAM.

Bootstrap-tier — these resources need to exist before any other root can
plan or apply via CI. The CI SA defined here is the principal every other
job runs as, so the *first* apply has to be local: a human, with their own
project-admin rights, runs `bazel run :terraform.apply` once. After that,
the SA can self-update the rest (and even most of itself, with the
exception of the IAM bindings that grant the SA its own permissions —
those would be a chicken-and-egg if the SA didn't already have them).

Project-level role grants live here so the CI SA can act on every other
root's resources (gar's `google_project_service`, lb's compute resources,
etc.) without per-root IAM duplication.
"""

load("//devtools/build/tools/tf:defs.bzl", "resource")
load("//devtools/build/tools/tf/resources:gcp.bzl", "service_account")

PROJECT = "senku-prod"

# Region for the Bazel remote cache bucket. `US` is the default — multi-region
# storage is fine since cache reads and writes are infrequent and small.
CACHE_REGION = "US"

# GitHub repo this WIF provider is bound to. Locks `attribute.repository`
# so an OIDC token from another repo can't impersonate this SA.
REPO = "arkeros/senku"

# Bazel remote cache bucket. Lifecycle rule deletes blobs after 30 days —
# Bazel's remote cache is a content-addressed cache, so old objects fall
# out naturally as inputs change. 30 days is the cushion before churn.
BAZEL_CACHE = resource(
    rtype = "google_storage_bucket",
    name = "bazel_cache",
    body = {
        "project": PROJECT,
        "name": "bazel-senku-remote-cache",
        "location": CACHE_REGION,
        "uniform_bucket_level_access": True,
        "lifecycle_rule": [{
            "condition": [{"age": 30}],
            "action": [{"type": "Delete"}],
        }],
    },
    attrs = ["id", "name", "url"],
)

# WIF pool + GitHub OIDC provider.
WIF_POOL = resource(
    rtype = "google_iam_workload_identity_pool",
    name = "github",
    body = {
        "project": PROJECT,
        "workload_identity_pool_id": "github",
        "display_name": "GitHub Actions",
    },
    attrs = ["id", "name", "workload_identity_pool_id"],
)

WIF_PROVIDER = resource(
    rtype = "google_iam_workload_identity_pool_provider",
    name = "github",
    body = {
        "project": PROJECT,
        "workload_identity_pool_id": WIF_POOL.workload_identity_pool_id,
        "workload_identity_pool_provider_id": "github-oidc",
        "display_name": "GitHub OIDC",
        "attribute_mapping": {
            "google.subject": "assertion.sub",
            "attribute.repository": "assertion.repository",
        },
        "attribute_condition": "assertion.repository == '%s'" % REPO,
        "oidc": [{
            "issuer_uri": "https://token.actions.githubusercontent.com",
        }],
    },
    attrs = ["id", "name"],
)

# CI service account: the principal every GHA workflow runs as.
GITHUB_ACTIONS_SA = service_account(
    name = "github_actions",
    project = PROJECT,
    account_id = "github-actions-senku",
    display_name = "GitHub Actions (senku)",
)

# Bind the WIF principal set (any token from this repo) to the SA's
# workloadIdentityUser role — that's what lets `google-github-actions/auth`
# exchange the OIDC token for a Google access token.
WIF_BINDING = resource(
    rtype = "google_service_account_iam_member",
    name = "wif_binding",
    body = {
        "service_account_id": GITHUB_ACTIONS_SA.name,
        "role": "roles/iam.workloadIdentityUser",
        "member": "principalSet://iam.googleapis.com/%s/attribute.repository/%s" % (
            WIF_POOL.name,
            REPO,
        ),
    },
    attrs = ["id", "etag"],
)

# Storage bucket bindings — narrow to objectAdmin on the specific buckets.
CACHE_BUCKET_BINDING = resource(
    rtype = "google_storage_bucket_iam_member",
    name = "cache_admin",
    body = {
        "bucket": BAZEL_CACHE.name,
        "role": "roles/storage.objectAdmin",
        "member": "serviceAccount:%s" % GITHUB_ACTIONS_SA.email,
    },
    attrs = ["id", "etag"],
)

TFSTATE_BUCKET_BINDING = resource(
    rtype = "google_storage_bucket_iam_member",
    name = "tfstate_admin",
    body = {
        # `senku-prod-terraform-state` is provisioned out-of-band (bootstrap);
        # see README. Referenced by name, not by `${...}` interpolation.
        "bucket": "senku-prod-terraform-state",
        "role": "roles/storage.objectAdmin",
        "member": "serviceAccount:%s" % GITHUB_ACTIONS_SA.email,
    },
    attrs = ["id", "etag"],
)

# Project-level role grants the CI SA needs to plan/apply every other root.
# `google_project_iam_member` (not `_binding`) so adding a role here doesn't
# evict roles granted out-of-band.
def _project_iam_member(role, slug):
    return resource(
        rtype = "google_project_iam_member",
        name = "ci_" + slug,
        body = {
            "project": PROJECT,
            "role": role,
            "member": "serviceAccount:%s" % GITHUB_ACTIONS_SA.email,
        },
        attrs = ["id", "etag"],
    )

PROJECT_IAM_BINDINGS = [
    # WIF/SA management. Lets the CI SA touch its own pool, provider, etc.
    _project_iam_member("roles/iam.workloadIdentityPoolAdmin",  "wif_admin"),
    _project_iam_member("roles/iam.serviceAccountAdmin",        "sa_admin"),
    # ActAs on runtime SAs (e.g. svc-registry) when terraform deploys
    # Cloud Run services that pin a `service_account_email`.
    _project_iam_member("roles/iam.serviceAccountUser",         "sa_user"),
    # Read/enable APIs (gar's `google_project_service`).
    # Was the missing role that broke the first CI plan run.
    _project_iam_member("roles/serviceusage.serviceUsageAdmin", "serviceusage"),
    # Per-resource admins for the rest of the deploy DAG.
    _project_iam_member("roles/storage.admin",                  "storage_admin"),
    _project_iam_member("roles/artifactregistry.admin",         "ar_admin"),
    _project_iam_member("roles/run.admin",                      "run_admin"),
    _project_iam_member("roles/compute.admin",                  "compute_admin"),
    _project_iam_member("roles/certificatemanager.editor",      "certmgr_editor"),
]

# Outputs.
OUTPUTS = [
    {"output": {"wif_provider": {
        "value": WIF_PROVIDER.name,
        "description": "Workload Identity Federation provider resource name. Used by GHA's `google-github-actions/auth` action as `workload_identity_provider`.",
    }}},
    {"output": {"sa_email": {
        "value": GITHUB_ACTIONS_SA.email,
        "description": "GitHub Actions service account email. Used by GHA's `google-github-actions/auth` action as `service_account`.",
    }}},
]

CI_DOCS = [
    BAZEL_CACHE,
    WIF_POOL,
    WIF_PROVIDER,
    GITHUB_ACTIONS_SA,
    WIF_BINDING,
    CACHE_BUCKET_BINDING,
    TFSTATE_BUCKET_BINDING,
] + PROJECT_IAM_BINDINGS + OUTPUTS
