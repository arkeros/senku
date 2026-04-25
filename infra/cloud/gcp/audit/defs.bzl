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

* **Meta-alert** on the alerting itself: a Data Access log-volume
  counter + absence alert that fires if no audit entries are seen for
  an hour. Catches the "someone disabled the audit config" or "an
  exclusion was widened" failure modes that would otherwise leave the
  other alerts silent.

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
    "logging_metric",
    "logging_project_exclusion",
    "monitoring_alert_policy_log_match",
    "monitoring_alert_policy_metric_absent",
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

# ---------- meta-alert: alerts on the alerting -----------------------------

# A logging metric counting all Data Access audit entries the project
# emits (across the services we enabled above), and an absence alert
# that fires when that count drops to zero for an hour.
#
# Failure modes this catches:
# * Someone disabled `google_project_iam_audit_config` for one or more
#   services (via terraform or out-of-band). Logs stop flowing, the
#   other alerts go silent.
# * A project-level log exclusion was widened too aggressively (e.g.
#   the 404-bucket exclusion's filter was dropped of its
#   `bucket_name=` clause and now matches all storage Data Access).
# * Audit Logs API itself broke (rare, but possible during outages).
#
# Steady state: tfstate and bazel cache reads generate continuous Data
# Access entries every CI run, so the metric is non-zero on any active
# day. An hour of silence is well past any plausible quiet window for
# this project.
DATA_ACCESS_VOLUME_METRIC = logging_metric(
    name = "data_access_volume",
    project = PROJECT,
    metric_name = "data_access_volume",
    description = "Count of Data Access audit log entries across enabled services. Used as the input to the data-access-silence absence alert.",
    filter = 'logName=~"projects/.+/logs/cloudaudit.googleapis.com%2Fdata_access"',
)

DATA_ACCESS_SILENCE_ALERT = monitoring_alert_policy_metric_absent(
    name = "data_access_silence",
    project = PROJECT,
    display_name = "Data Access audit logs went silent",
    # `resource.type="global"` is the correct monitored resource for a
    # user-defined log-based metric. The provider/console naming
    # ("logging metric") is for the *resource kind* in terraform, not
    # the Cloud Monitoring resource type the metric reports against.
    metric_filter = (
        'metric.type="logging.googleapis.com/user/data_access_volume" ' +
        'resource.type="global"'
    ),
    notification_channels = _CHANNELS,
    duration = "3600s",
    documentation = (
        "**No Data Access audit entries for an hour. The other alerts may have gone silent.**\n\n" +
        "Steady state: tfstate + bazel cache reads keep this metric non-zero through any active day. " +
        "Going to zero means either:\n\n" +
        "1. `google_project_iam_audit_config` for one or more services was disabled (check `bazel run //infra/cloud/gcp/audit:terraform.plan` for unexpected drift).\n" +
        "2. A project-level log exclusion was widened (compare `_Default` sink exclusions to `LOG_EXCLUSIONS` in `audit/defs.bzl`).\n" +
        "3. The senku-prod project went genuinely idle (no CI runs, no terraform apply) — confirm by checking GHA for recent activity. If yes, dismiss; otherwise the apparent quiet is a tampering signal.\n" +
        "4. Cloud Audit Logs API outage — check the GCP status page."
    ),
)

META_ALERTS = [DATA_ACCESS_VOLUME_METRIC, DATA_ACCESS_SILENCE_ALERT]

AUDIT_DOCS = (
    AUDIT_CONFIGS +
    LOG_EXCLUSIONS +
    [ALERT_EMAIL_VAR, ALERT_EMAIL] +
    ALERT_POLICIES +
    META_ALERTS
)
