"""Project-level Cloud Audit Logs config + alert policies.

Bootstrap-tier — applied locally only (see `.aspect/stdlib.axl`). Audit
config and alerts are the kind of thing a compromise tries to disable;
keeping them out of the CI apply path means a stolen apply token can't
`terraform apply` them away. The apply SA's role set already excludes
the `iam.securityAdmin` / `setIamPolicy(project)` capability needed to
disable an audit config or alert policy via direct API calls, but
defense-in-depth: also keep the terraform path closed.

What's enabled:

* **Admin Activity** logs are on by default for all GCP services. They
  capture SA impersonation, IAM changes, resource create/delete/update.
  No config required.
* **Data Access** logs are off by default. This root turns them on for
  the services where a forensic trail of *reads* matters:

  - `iam.googleapis.com` — IAM policy and SA reads (enumeration).
  - `cloudresourcemanager.googleapis.com` — project IAM reads.
  - `storage.googleapis.com` — GCS object reads. Catches tfstate / cache
    exfil. The bazel cache generates volume here, but senku-prod is a
    small project so cost is bounded. The LB's default-404 bucket
    (which serves public 404s for unmatched URLs) is excluded via a
    project-level log exclusion below — its read traffic is internet
    scanner noise, not security signal.

  Notably absent: `iamcredentials.googleapis.com`. It does not support
  service-level audit log configuration (the API rejects it with
  "service does not exist or does not support service level
  configuration"). Its `GenerateAccessToken` events ship in Admin
  Activity by default, which is what the impersonation alert below
  filters on — no Data Access toggle is needed.

* **Alert policies** for high-signal patterns on the WIF/SA path:

  - Impersonation of `tf-apply` from any subject other than the
    expected `repo:arkeros/senku:environment:prod`.
  - `setIamPolicy` calls authored by `tf-apply` itself (steady-state
    apply rarely touches IAM; review every occurrence).
  - Update/delete on the `github` WIF pool or provider (the rebind path
    that would re-widen the principalSet).

Not enabled (deliberately):

* `service = "allServices"` — would be a cost footgun once data-plane
  services (Cloud Run request paths, etc.) come online. Add services
  by name as the threat model expands.
* Log sinks / BigQuery export — separate concern. Default Cloud
  Logging retention (400d Admin Activity, 30d Data Access) is enough
  for incident forensics; long-term retention is a compliance ask, not
  a security ask, and is handled separately when needed.
"""

load(
    "//devtools/build/tools/tf:defs.bzl",
    "var",
)
load(
    "//devtools/build/tools/tf/resources:gcp.bzl",
    "logging_project_exclusion",
    "monitoring_alert_policy_log_match",
    "monitoring_notification_channel",
    "project_iam_audit_config",
)
load(
    "//infra/cloud/gcp/lb:defs.bzl",
    "DEFAULT_404_BUCKET_NAME",
)

PROJECT = "senku-prod"

# Identities the alerts assert about. Hardcoded here (not loaded from
# the `ci/` defs.bzl) because:
# 1. This root is bootstrap-tier and bound to the same project — the SA
#    naming is stable and a string change would surface in review.
# 2. Avoiding a load() across roots keeps each tf_root self-contained.
APPLY_SA_EMAIL = "github-actions-senku-apply@senku-prod.iam.gserviceaccount.com"

# OIDC subject GitHub mints for an `environment: prod` job in this repo.
# Anything else impersonating the apply SA is suspicious.
EXPECTED_APPLY_SUBJECT = "repo:arkeros/senku:environment:prod"

# ---------- audit logs ------------------------------------------------------

# DATA_READ + DATA_WRITE on the IAM control plane. ADMIN_READ is already
# in Admin Activity for these services, so explicit ADMIN_READ here would
# only duplicate. DATA_WRITE catches setIamPolicy detail beyond what
# Admin Activity emits.
_DATA_LOGS = ["DATA_READ", "DATA_WRITE"]

AUDIT_CONFIGS = [
    project_iam_audit_config(
        name = "iam",
        project = PROJECT,
        service = "iam.googleapis.com",
        log_types = _DATA_LOGS,
    ),
    project_iam_audit_config(
        name = "cloudresourcemanager",
        project = PROJECT,
        service = "cloudresourcemanager.googleapis.com",
        log_types = _DATA_LOGS,
    ),
    # Object reads on tfstate + bazel cache. High-signal for exfil.
    project_iam_audit_config(
        name = "storage",
        project = PROJECT,
        service = "storage.googleapis.com",
        log_types = _DATA_LOGS,
    ),
]

# ---------- log exclusions --------------------------------------------------

# Drop audit entries on the LB's default-404 bucket before they hit the
# `_Default` log bucket. The 404 bucket exists to return 404 for every
# unmatched URL on the LB — every internet-scanner probe generates a
# `storage.objects.get` audit event when DATA_READ is on, which is high
# volume and zero security signal. Bucket name is loaded from the lb
# root at Starlark build time, so a rename there propagates here on the
# next `bazel build` (no apply-order coupling — load happens before
# either root runs).
LOG_EXCLUSIONS = [
    logging_project_exclusion(
        name = "exclude_lb_404_bucket_audit",
        project = PROJECT,
        exclusion_name = "exclude-lb-404-bucket-audit",
        description = "Drop Data Access audit entries on the LB 404 bucket — public-internet read traffic is noise, not security signal.",
        filter = (
            'logName=~"projects/.+/logs/cloudaudit.googleapis.com%2Fdata_access" ' +
            'resource.type="gcs_bucket" ' +
            'resource.labels.bucket_name="%s"' % DEFAULT_404_BUCKET_NAME
        ),
    ),
]

# ---------- notification channel -------------------------------------------

# Email destination is supplied at apply time via `TF_VAR_alert_email`
# in the shell — keeps personal email out of source control. Set it in
# your shell rc / direnv file:
#
#     export TF_VAR_alert_email=you@example.com
#
# `terraform plan` runs with `-input=false`, so a missing var fails fast
# with "No value for required variable" rather than hanging on a prompt.
ALERT_EMAIL_VAR = {"variable": {"alert_email": {
    "type": "string",
    "description": "Destination email for security-alert notifications. Supplied via $TF_VAR_alert_email; no default so a missing value fails plan fast.",
    "sensitive": True,
}}}

# Email is the lowest-friction channel and the right shape for a
# single-maintainer project. To swap to Slack/PagerDuty: change `type`
# and `labels` per the GCP provider docs and re-apply.
ALERT_EMAIL = monitoring_notification_channel(
    name = "alert_email",
    project = PROJECT,
    display_name = "Security alerts (email)",
    type = "email",
    labels = {"email_address": var("alert_email")},
)

_CHANNELS = [ALERT_EMAIL.id]

# ---------- alert policies --------------------------------------------------

# Alert 1: tf-apply impersonated by anything other than the expected
# `environment: prod` subject.
#
# In the steady state, every legitimate impersonation of tf-apply
# carries `principalSubject = principal://.../subject/<EXPECTED_APPLY_SUBJECT>`
# (the OIDC `sub` from a `prod` job). Any other principal — a different
# WIF subject, a human via `gcloud auth ...`, another SA with
# `serviceAccountTokenCreator` — is anomalous and worth a notification,
# even if technically authorized.
APPLY_IMPERSONATION_ALERT = monitoring_alert_policy_log_match(
    name = "apply_impersonation",
    project = PROJECT,
    display_name = "tf-apply impersonated by unexpected principal",
    filter = (
        'protoPayload.serviceName="iamcredentials.googleapis.com" ' +
        'protoPayload.methodName="GenerateAccessToken" ' +
        'resource.labels.email_id="%s" ' % APPLY_SA_EMAIL +
        # `principalSubject` is set for federated identities (WIF). For
        # non-WIF callers (humans via gcloud, other SAs with
        # serviceAccountTokenCreator) the field is absent, which the
        # `NOT … : substring` operator treats as non-matching — so the
        # alert fires for those too. That's intentional: any
        # impersonation that isn't the prod WIF subject is anomalous.
        'NOT protoPayload.authenticationInfo.principalSubject:"%s"' % EXPECTED_APPLY_SUBJECT
    ),
    notification_channels = _CHANNELS,
    documentation = (
        "**tf-apply was impersonated by a principal other than the expected `prod` GitHub environment.**\n\n" +
        "Expected subject: `%s`\n\n" % EXPECTED_APPLY_SUBJECT +
        "Triage:\n" +
        "1. Check `protoPayload.authenticationInfo.principalSubject` / `principalEmail` in the matching log entry.\n" +
        "2. If a human: confirm with that human directly out-of-band.\n" +
        "3. If a different WIF subject: the `attribute.environment/prod` principalSet binding may have been widened — check `infra/cloud/gcp/ci:terraform.plan`.\n" +
        "4. If unexplained: rotate the apply SA, freeze main, and audit recent `setIamPolicy` events on the project."
    ),
)

# Alert 2: tf-apply called setIamPolicy.
#
# Steady-state `terraform apply` of the non-bootstrap roots rarely
# touches IAM (Cloud Run, GAR, LB don't add IAM bindings on every run).
# Any setIamPolicy from this principal is review-worthy. False
# positives expected when adding genuinely-new IAM resources via PR;
# accept the noise for the signal.
APPLY_SETIAMPOLICY_ALERT = monitoring_alert_policy_log_match(
    name = "apply_setiampolicy",
    project = PROJECT,
    display_name = "tf-apply called setIamPolicy",
    filter = (
        'protoPayload.authenticationInfo.principalEmail="%s" ' % APPLY_SA_EMAIL +
        '(protoPayload.methodName=~".*\\.setIamPolicy$" OR ' +
        'protoPayload.methodName=~".*\\.SetIamPolicy$")'
    ),
    notification_channels = _CHANNELS,
    documentation = (
        "**tf-apply called `setIamPolicy`.**\n\n" +
        "Steady-state apply of non-bootstrap roots should not modify IAM. " +
        "Either a PR added a new IAM-touching resource (review the diff on `main`), " +
        "or the apply SA is being used to widen permissions outside terraform.\n\n" +
        "Triage:\n" +
        "1. Find the apply run in GHA — does the diff explain the IAM call?\n" +
        "2. If yes: dismiss.\n" +
        "3. If no: rotate the apply SA, freeze main, audit recent commits."
    ),
)

# Alert 3: any update/delete on the `github` WIF pool or provider.
#
# This is the rebind-yourself-back-to-broad-scope path. Steady state:
# the only mutations are from `terraform apply` of `infra/cloud/gcp/ci`,
# which is bootstrap-tier and applied locally by a human. CI never
# touches these resources. Any modification by anything else means
# either a manual operator action (rare, traceable) or compromise.
WIF_MUTATION_ALERT = monitoring_alert_policy_log_match(
    name = "wif_mutation",
    project = PROJECT,
    display_name = "WIF pool or provider modified",
    filter = (
        'protoPayload.serviceName="iam.googleapis.com" ' +
        '(protoPayload.methodName=~".*UpdateWorkloadIdentityPool.*" OR ' +
        'protoPayload.methodName=~".*DeleteWorkloadIdentityPool.*") ' +
        'protoPayload.resourceName=~".*workloadIdentityPools/github.*"'
    ),
    notification_channels = _CHANNELS,
    documentation = (
        "**The `github` WIF pool or one of its providers was modified.**\n\n" +
        "Expected source: a human-driven `bazel run //infra/cloud/gcp/ci:terraform.apply`. " +
        "CI cannot mutate these resources (bootstrap root is filtered out by aspect-cli).\n\n" +
        "Triage:\n" +
        "1. Check `protoPayload.authenticationInfo.principalEmail` — is it the human who applied?\n" +
        "2. Confirm out-of-band that the apply was intentional.\n" +
        "3. If unexplained: this is the rebind-to-broad-scope path. Re-run `bazel run //infra/cloud/gcp/ci:terraform.plan` to compare current vs declared state."
    ),
)

ALERT_POLICIES = [
    APPLY_IMPERSONATION_ALERT,
    APPLY_SETIAMPOLICY_ALERT,
    WIF_MUTATION_ALERT,
]

AUDIT_DOCS = AUDIT_CONFIGS + LOG_EXCLUSIONS + [ALERT_EMAIL_VAR, ALERT_EMAIL] + ALERT_POLICIES
