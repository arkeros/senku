"""CI bootstrap: WIF pool/provider, GitHub Actions SAs, Bazel remote cache, IAM.

Bootstrap-tier — these resources need to exist before any other root can
plan or apply via CI. The CI SAs defined here are the principals every
other job runs as, so the *first* apply has to be local: a human, with
their own project-admin rights, runs `bazel run :terraform.apply` once.
After that, the apply SA can self-update the rest (and even most of
itself, with the exception of the IAM bindings that grant the SA its own
permissions — those would be a chicken-and-egg if the SA didn't already
have them).

Two SAs, scoped by GitHub deployment environment:

* `tf-plan` — read-only. Bound to the `pr-plan` GitHub environment, which
  is unprotected on purpose so PR plans run on any branch. Worst case if
  compromised: read project metadata, churn tfstate. Recoverable.
* `tf-apply` — admin. Bound to the `prod` GitHub environment, which is
  configured with `main`-only deployment branches and required reviewers.
  An attacker needs push-to-main *and* a reviewer to mint a token.

The split moves the branch/reviewer gate out of the workflow YAML (which
any committer can edit on a feature branch) and into the GitHub identity
layer (configured in repo settings, separate credential surface).

Caveat: `tf-apply` retains `iam.workloadIdentityPoolAdmin` and
`serviceAccountAdmin`, so it can in principle re-bind itself to a wider
principalSet. That privilege escalation is now gated by main + reviewer
+ Cloud Audit Logs, but it remains a path. Follow-up work: extract the
bootstrap roles into a separate human-applied root so CI cannot edit
its own identity infrastructure.

Project-level role grants live here so the CI SAs can act on every other
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
# so an OIDC token from another repo can't impersonate either SA.
REPO = "arkeros/senku"
REPO_OWNER = "arkeros"

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

# `attribute.environment` is the load-bearing claim — bindings below pin
# each SA to a specific GitHub deployment environment, so the only tokens
# that match are those minted by a job that declared `environment: <name>`
# and passed the environment's protection rules (deployment branch +
# required reviewers, configured in GitHub repo settings).
#
# `repository_owner` is belt-and-suspenders: defends against a future
# username swap or repo transfer reusing `arkeros/senku`.
WIF_PROVIDER = iam_workload_identity_pool_provider(
    name = "github",
    project = PROJECT,
    workload_identity_pool_id = WIF_POOL.workload_identity_pool_id,
    workload_identity_pool_provider_id = "github-oidc",
    display_name = "GitHub OIDC",
    attribute_mapping = {
        "google.subject": "assertion.sub",
        "attribute.repository": "assertion.repository",
        "attribute.repository_owner": "assertion.repository_owner",
        "attribute.environment": "assertion.environment",
        "attribute.ref": "assertion.ref",
    },
    attribute_condition = (
        "assertion.repository == '%s' && " % REPO +
        "assertion.repository_owner == '%s'" % REPO_OWNER
    ),
    oidc = {"issuer_uri": "https://token.actions.githubusercontent.com"},
)

# Plan SA: read-only. Used by the PR plan job under the `pr-plan`
# environment. Read-only roles mean even an unprotected environment
# binding is acceptable — the worst a compromised plan token can do is
# read project metadata or churn tfstate.
TF_PLAN_SA = service_account(
    name = "tf_plan",
    project = PROJECT,
    account_id = "github-actions-senku-plan",
    display_name = "GitHub Actions plan (senku)",
)

# Apply SA: admin. Used by the apply job under the `prod` environment,
# which is configured in GitHub with `main`-only deployment branches and
# required reviewers. Token minting is gated by both before this SA can
# be impersonated.
TF_APPLY_SA = service_account(
    name = "tf_apply",
    project = PROJECT,
    account_id = "github-actions-senku-apply",
    display_name = "GitHub Actions apply (senku)",
)

# WIF principalSet bindings, scoped by environment.
#
# `attribute.environment/<name>` only matches tokens minted under a
# GitHub job that declared `environment: <name>`. GitHub validates the
# environment's protection rules *before* issuing the token, so the
# branch/reviewer gate is enforced at token-mint time rather than by a
# workflow `if:` guard.
TF_PLAN_WIF_BINDING = service_account_iam_member(
    name = "tf_plan_wif_binding",
    service_account_id = TF_PLAN_SA.name,
    role = "roles/iam.workloadIdentityUser",
    member = "principalSet://iam.googleapis.com/%s/attribute.environment/pr-plan" % WIF_POOL.name,
)

TF_APPLY_WIF_BINDING = service_account_iam_member(
    name = "tf_apply_wif_binding",
    service_account_id = TF_APPLY_SA.name,
    role = "roles/iam.workloadIdentityUser",
    member = "principalSet://iam.googleapis.com/%s/attribute.environment/prod" % WIF_POOL.name,
)

# Storage bucket bindings.
#
# Bazel cache: both SAs read/write. Content-addressed, not security-sensitive.
# Tfstate: both SAs read/write. Plan needs the lock + state read; apply
# needs to write state.
CACHE_BUCKET_BINDINGS = [
    storage_bucket_iam_member(
        name = "cache_admin_plan",
        bucket = BAZEL_CACHE.name,
        role = "roles/storage.objectAdmin",
        member = TF_PLAN_SA.member,
    ),
    storage_bucket_iam_member(
        name = "cache_admin_apply",
        bucket = BAZEL_CACHE.name,
        role = "roles/storage.objectAdmin",
        member = TF_APPLY_SA.member,
    ),
]

# `senku-prod-terraform-state` is provisioned out-of-band (bootstrap);
# see plan doc. Referenced by name, not by `${...}` interpolation.
TFSTATE_BUCKET_BINDINGS = [
    storage_bucket_iam_member(
        name = "tfstate_admin_plan",
        bucket = "senku-prod-terraform-state",
        role = "roles/storage.objectAdmin",
        member = TF_PLAN_SA.member,
    ),
    storage_bucket_iam_member(
        name = "tfstate_admin_apply",
        bucket = "senku-prod-terraform-state",
        role = "roles/storage.objectAdmin",
        member = TF_APPLY_SA.member,
    ),
]

# Project-level role grants. `google_project_iam_member` (not `_binding`)
# so adding a role here doesn't evict roles granted out-of-band.
def _grant(slug, role, sa):
    return project_iam_member(
        name = slug,
        project = PROJECT,
        role = role,
        member = sa.member,
    )

# Plan SA: read-only across the project. `viewer` covers most read paths;
# `iam.securityReviewer` ensures IAM policy reads (which `viewer` does
# not always grant). `serviceUsageConsumer` lets plan refresh API state
# (`google_project_service` data sources).
PLAN_PROJECT_BINDINGS = [
    _grant("plan_viewer", "roles/viewer", TF_PLAN_SA),
    _grant("plan_iam_reviewer", "roles/iam.securityReviewer", TF_PLAN_SA),
    _grant("plan_serviceusage", "roles/serviceusage.serviceUsageConsumer", TF_PLAN_SA),
]

# Apply SA: admin roles for every root in the deploy DAG.
APPLY_PROJECT_BINDINGS = [
    # WIF/SA management. Lets the apply SA touch its own pool, provider,
    # etc. NOTE: this is the privilege-escalation path called out in the
    # module docstring — pulling these out into a separate human-applied
    # root is the planned follow-up.
    _grant("apply_wif_admin", "roles/iam.workloadIdentityPoolAdmin", TF_APPLY_SA),
    _grant("apply_sa_admin", "roles/iam.serviceAccountAdmin", TF_APPLY_SA),
    # ActAs on runtime SAs (e.g. svc-registry) when terraform deploys
    # Cloud Run services that pin a `service_account_email`.
    _grant("apply_sa_user", "roles/iam.serviceAccountUser", TF_APPLY_SA),
    # Read/enable APIs (gar's `google_project_service`).
    _grant("apply_serviceusage", "roles/serviceusage.serviceUsageAdmin", TF_APPLY_SA),
    # Per-resource admins for the rest of the deploy DAG.
    _grant("apply_storage_admin", "roles/storage.admin", TF_APPLY_SA),
    _grant("apply_ar_admin", "roles/artifactregistry.admin", TF_APPLY_SA),
    _grant("apply_run_admin", "roles/run.admin", TF_APPLY_SA),
    _grant("apply_compute_admin", "roles/compute.admin", TF_APPLY_SA),
    _grant("apply_certmgr_editor", "roles/certificatemanager.editor", TF_APPLY_SA),
]

PROJECT_IAM_BINDINGS = PLAN_PROJECT_BINDINGS + APPLY_PROJECT_BINDINGS

# Outputs.
OUTPUTS = [
    {"output": {"wif_provider": {
        "value": WIF_PROVIDER.name,
        "description": "Workload Identity Federation provider resource name. Used by GHA's `google-github-actions/auth` action as `workload_identity_provider`.",
    }}},
    {"output": {"tf_plan_sa_email": {
        "value": TF_PLAN_SA.email,
        "description": "Plan SA email. Used by the PR `plan` job (under the `pr-plan` environment) as `service_account` in `google-github-actions/auth`.",
    }}},
    {"output": {"tf_apply_sa_email": {
        "value": TF_APPLY_SA.email,
        "description": "Apply SA email. Used by the `apply` job (under the `prod` environment) as `service_account` in `google-github-actions/auth`.",
    }}},
]

CI_DOCS = [
    BAZEL_CACHE,
    WIF_POOL,
    WIF_PROVIDER,
    TF_PLAN_SA,
    TF_APPLY_SA,
    TF_PLAN_WIF_BINDING,
    TF_APPLY_WIF_BINDING,
] + CACHE_BUCKET_BINDINGS + TFSTATE_BUCKET_BINDINGS + PROJECT_IAM_BINDINGS + OUTPUTS
