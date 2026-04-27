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

  - WIF impersonation of `tf-apply` from a subject other than the
    expected `repo:arkeros/senku:environment:prod` (the prod WIF
    binding has been widened, or another GitHub OIDC subject is
    minting prod tokens).
  - Non-WIF impersonation of `tf-apply` (a human via `gcloud
    --impersonate-service-account`, or another SA holding
    `serviceAccountTokenCreator` on tf-apply).
  - `setIamPolicy` calls authored by `tf-apply` itself (steady-state
    apply rarely touches IAM; review every occurrence).
  - Update/delete on the `github` WIF pool or provider (the rebind path
    that would re-widen the principalSet).

  The two impersonation alerts are split rather than fused into one
  because their triage paths diverge: a wrong WIF subject points at a
  binding mutation in `ci/defs.bzl`, while a non-WIF caller points at
  an IAM policy on the SA. Each filter then expresses one yes/no
  question, which makes both readable and testable.

* **Meta-alert** on the alerting itself: a Data Access log-volume
  counter + absence alert that fires if no audit entries are seen for
  23h30m (the GCP-imposed maximum for absence-alert duration).
  Catches the "someone disabled the audit config" or "an exclusion
  was widened" failure modes that would otherwise leave the other
  alerts silent.

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
    "variable",
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
ALERT_EMAIL_VAR = variable(
    "alert_email",
    description = "Destination email for security-alert notifications. Supplied via $TF_VAR_alert_email; no default so a missing value fails plan fast.",
    sensitive = True,
)

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

# Each GenerateAccessToken call emits two Data Access audit entries:
# an ADMIN_READ entry identifying the caller (carries `principalSubject`
# for WIF, `principalEmail` for human / cross-SA), and a DATA_READ
# companion that records the short-lived credential issuance on the
# impersonated SA (`principalEmail = <SA itself>`, `principalSubject`
# absent, no `operation.id`). Both alerts below qualify on
# `permissionType="ADMIN_READ"` to look at the caller-side entry only;
# without this the `NOT field:"x"` substring predicate matches the
# DATA_READ twin on every legitimate apply (absent-field → non-match)
# and pages CRITICAL on every CI run. Empirically verified via op-id
# correlation; not spelled out in GCP docs but stable behavior.
#
# The split into WIF vs non-WIF lets each filter answer one yes/no
# question (subject set or absent) and maps to distinct triage paths
# (binding widened vs IAM policy on the SA).

# Alert 1a: WIF impersonation of tf-apply from a subject other than
# the expected `environment: prod` one. Steady state: every legitimate
# impersonation carries `principalSubject = principal://.../subject/
# <EXPECTED_APPLY_SUBJECT>`. A different WIF subject means either the
# `attribute.environment/prod` principalSet binding has been widened
# (check `infra/cloud/gcp/ci:terraform.plan`), or another GitHub OIDC
# subject has been bound to tf-apply out-of-band.
APPLY_IMPERSONATION_WIF_ALERT = monitoring_alert_policy_log_match(
    name = "apply_impersonation_wif",
    project = PROJECT,
    display_name = "tf-apply impersonated by unexpected WIF subject",
    # CRITICAL: a wrong WIF subject minting prod tokens is one rebind
    # away from full apply-SA control. Wake somebody up.
    severity = "CRITICAL",
    filter = (
        'protoPayload.serviceName="iamcredentials.googleapis.com" ' +
        'protoPayload.methodName="GenerateAccessToken" ' +
        'resource.labels.email_id="%s" ' % APPLY_SA_EMAIL +
        'protoPayload.authorizationInfo.permissionType="ADMIN_READ" ' +
        # `principalSubject:"principal://"` is a positive existence
        # check — every WIF subject starts with that scheme, so this
        # restricts to "subject is set and looks like a principalSet
        # member." Then the NOT excludes the prod-env one.
        'protoPayload.authenticationInfo.principalSubject:"principal://" ' +
        'NOT protoPayload.authenticationInfo.principalSubject:"%s"' % EXPECTED_APPLY_SUBJECT
    ),
    notification_channels = _CHANNELS,
    documentation = (
        "**tf-apply was impersonated by a WIF subject other than the expected `prod` GitHub environment.**\n\n" +
        "Expected subject: `%s`\n\n" % EXPECTED_APPLY_SUBJECT +
        "Triage:\n" +
        "1. Check `protoPayload.authenticationInfo.principalSubject` in the matching log entry — what subject was used?\n" +
        "2. The `attribute.environment/prod` principalSet binding may have been widened — run `bazel run //infra/cloud/gcp/ci:terraform.plan` and look for a delta on `TF_APPLY_WIF_BINDING`.\n" +
        "3. If the binding is intact: another principalSet was bound out-of-band. `gcloud iam service-accounts get-iam-policy %s` and look for unexpected `principalSet://` members.\n" % APPLY_SA_EMAIL +
        "4. If unexplained: rotate the apply SA, freeze main, and audit recent `setIamPolicy` events on the project."
    ),
)

# Alert 1b: non-WIF impersonation of tf-apply (a human via gcloud, or
# another SA holding `serviceAccountTokenCreator` on tf-apply). Steady
# state: nothing should impersonate tf-apply except the prod WIF
# subject. A human or sibling SA showing up means either intentional
# operator action (verifiable out-of-band) or a widened SA-IAM policy.
APPLY_IMPERSONATION_NONWIF_ALERT = monitoring_alert_policy_log_match(
    name = "apply_impersonation_nonwif",
    project = PROJECT,
    display_name = "tf-apply impersonated by non-WIF principal",
    # CRITICAL: same urgency as the WIF case — different attacker
    # profile, same blast radius (full apply-SA control).
    severity = "CRITICAL",
    filter = (
        'protoPayload.serviceName="iamcredentials.googleapis.com" ' +
        'protoPayload.methodName="GenerateAccessToken" ' +
        'resource.labels.email_id="%s" ' % APPLY_SA_EMAIL +
        'protoPayload.authorizationInfo.permissionType="ADMIN_READ" ' +
        # Subject absent → not a WIF call. The `NOT … :"principal://"`
        # form treats absent as non-matching, so the outer NOT flips
        # to true → matches when the field is absent.
        'NOT protoPayload.authenticationInfo.principalSubject:"principal://" ' +
        # Belt-and-braces against any pathological case where an
        # ADMIN_READ entry could carry `principalEmail = tf-apply`
        # (the SA acting as itself). Not observed in practice given
        # the permissionType filter, but a no-op exclusion if it
        # never happens.
        'NOT protoPayload.authenticationInfo.principalEmail="%s"' % APPLY_SA_EMAIL
    ),
    notification_channels = _CHANNELS,
    documentation = (
        "**tf-apply was impersonated by a non-WIF principal (human or other SA).**\n\n" +
        "Triage:\n" +
        "1. Check `protoPayload.authenticationInfo.principalEmail` in the matching log entry — who called?\n" +
        "2. If a human you recognize: confirm out-of-band that the impersonation was intentional (gcloud `--impersonate-service-account` or similar).\n" +
        "3. If another SA: `gcloud iam service-accounts get-iam-policy %s` and look for unexpected `serviceAccountTokenCreator` bindings.\n" % APPLY_SA_EMAIL +
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
    # WARNING: often legitimate (a PR genuinely added an IAM resource).
    # Review-worthy, not page-worthy.
    severity = "WARNING",
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
    # CRITICAL: this is the rebind-to-broad-scope path. CI cannot
    # touch these resources by design, so any mutation is either a
    # human-driven local apply (verifiable out-of-band) or compromise.
    severity = "CRITICAL",
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
    APPLY_IMPERSONATION_WIF_ALERT,
    APPLY_IMPERSONATION_NONWIF_ALERT,
    APPLY_SETIAMPOLICY_ALERT,
    WIF_MUTATION_ALERT,
]

# ---------- meta-alert: alerts on the alerting -----------------------------

# A logging metric counting all Data Access audit entries the project
# emits (across the services we enabled above), and an absence alert
# that fires when that count stays at zero for 23h30m.
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
# Steady state: this is a single-maintainer project with bursty CI
# activity — quiet evenings and weekends are normal, so an hour of
# silence is well within the plausible idle window. 23h30m is the
# maximum GCP allows for absence-alert duration (the API rejects
# anything > 23h30m), and is also approximately the longest plausible
# quiet stretch — a workday plus an evening of inactivity.
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
    # ERROR: the audit pipeline is broken. By the time this fires
    # (23h30m after last entry) the damage is done — needs attention,
    # but not the same urgency as an active impersonation in flight.
    severity = "ERROR",
    # `resource.type="global"` is the correct monitored resource for a
    # user-defined log-based metric. The provider/console naming
    # ("logging metric") is for the *resource kind* in terraform, not
    # the Cloud Monitoring resource type the metric reports against.
    metric_filter = (
        'metric.type="logging.googleapis.com/user/data_access_volume" ' +
        'resource.type="global"'
    ),
    notification_channels = _CHANNELS,
    # 23h30m is the GCP-imposed maximum for absence-alert duration —
    # the API rejects anything longer with "Durations longer than
    # 23h30m are not supported".
    duration = "84600s",
    documentation = (
        "**No Data Access audit entries for ~24 hours. The other alerts may have gone silent.**\n\n" +
        "Steady state: bursty CI + occasional local tfstate reads keep this metric non-zero across any normal day. " +
        "A full day of zero means either:\n\n" +
        "1. `google_project_iam_audit_config` for one or more services was disabled (check `bazel run //infra/cloud/gcp/audit:terraform.plan` for unexpected drift).\n" +
        "2. A project-level log exclusion was widened (compare `_Default` sink exclusions to `LOG_EXCLUSIONS` in `audit/defs.bzl`).\n" +
        "3. The senku-prod project went genuinely idle for 24h+ (no CI runs, no terraform apply, no local reads) — confirm by checking GHA for recent activity. If yes, dismiss; otherwise the apparent quiet is a tampering signal.\n" +
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
