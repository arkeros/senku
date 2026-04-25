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

load(
    "//devtools/build/tools/tf/resources:gcp.bzl",
    "iam_workload_identity_pool",
    "iam_workload_identity_pool_provider",
    "project_iam_member",
    "service_account",
    "service_account_iam_member",
    "storage_bucket",
    "storage_bucket_iam_member",
)

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
BAZEL_CACHE = storage_bucket(
    name = "bazel_cache",
    project = PROJECT,
    bucket_name = "bazel-senku-remote-cache",
    location = CACHE_REGION,
    uniform_bucket_level_access = True,
    lifecycle_rule = [{
        "condition": [{"age": 30}],
        "action": [{"type": "Delete"}],
    }],
)

# WIF pool + GitHub OIDC provider.
WIF_POOL = iam_workload_identity_pool(
    name = "github",
    project = PROJECT,
    workload_identity_pool_id = "github",
    display_name = "GitHub Actions",
)

WIF_PROVIDER = iam_workload_identity_pool_provider(
    name = "github",
    project = PROJECT,
    workload_identity_pool_id = WIF_POOL.workload_identity_pool_id,
    workload_identity_pool_provider_id = "github-oidc",
    display_name = "GitHub OIDC",
    attribute_mapping = {
        "google.subject": "assertion.sub",
        "attribute.repository": "assertion.repository",
    },
    attribute_condition = "assertion.repository == '%s'" % REPO,
    oidc = {"issuer_uri": "https://token.actions.githubusercontent.com"},
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
WIF_BINDING = service_account_iam_member(
    name = "wif_binding",
    service_account_id = GITHUB_ACTIONS_SA.name,
    role = "roles/iam.workloadIdentityUser",
    member = "principalSet://iam.googleapis.com/%s/attribute.repository/%s" % (
        WIF_POOL.name,
        REPO,
    ),
)

# Storage bucket bindings — narrow to objectAdmin on the specific buckets.
CACHE_BUCKET_BINDING = storage_bucket_iam_member(
    name = "cache_admin",
    bucket = BAZEL_CACHE.name,
    role = "roles/storage.objectAdmin",
    member = "serviceAccount:%s" % GITHUB_ACTIONS_SA.email,
)

TFSTATE_BUCKET_BINDING = storage_bucket_iam_member(
    name = "tfstate_admin",
    # `senku-prod-terraform-state` is provisioned out-of-band (bootstrap);
    # see plan doc. Referenced by name, not by `${...}` interpolation.
    bucket = "senku-prod-terraform-state",
    role = "roles/storage.objectAdmin",
    member = "serviceAccount:%s" % GITHUB_ACTIONS_SA.email,
)

# Project-level role grants the CI SA needs to plan/apply every other root.
# `google_project_iam_member` (not `_binding`) so adding a role here doesn't
# evict roles granted out-of-band.
_CI_SA_MEMBER = "serviceAccount:%s" % GITHUB_ACTIONS_SA.email

def _ci_grant(slug, role):
    return project_iam_member(
        name = "ci_" + slug,
        project = PROJECT,
        role = role,
        member = _CI_SA_MEMBER,
    )

PROJECT_IAM_BINDINGS = [
    # WIF/SA management. Lets the CI SA touch its own pool, provider, etc.
    _ci_grant("wif_admin",      "roles/iam.workloadIdentityPoolAdmin"),
    _ci_grant("sa_admin",       "roles/iam.serviceAccountAdmin"),
    # ActAs on runtime SAs (e.g. svc-registry) when terraform deploys
    # Cloud Run services that pin a `service_account_email`.
    _ci_grant("sa_user",        "roles/iam.serviceAccountUser"),
    # Read/enable APIs (gar's `google_project_service`).
    # Was the missing role that broke the first CI plan run.
    _ci_grant("serviceusage",   "roles/serviceusage.serviceUsageAdmin"),
    # Per-resource admins for the rest of the deploy DAG.
    _ci_grant("storage_admin",  "roles/storage.admin"),
    _ci_grant("ar_admin",       "roles/artifactregistry.admin"),
    _ci_grant("run_admin",      "roles/run.admin"),
    _ci_grant("compute_admin",  "roles/compute.admin"),
    _ci_grant("certmgr_editor", "roles/certificatemanager.editor"),
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
