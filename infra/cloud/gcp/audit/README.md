# `infra/cloud/gcp/audit` — project-level audit logs and security alerts

Bootstrap-tier root. Applied locally only — `aspect plan` / `aspect apply` skip it under `$CI` because the apply SA isn't allowed to mutate audit config or alerts (one of the things a compromise tries to disable, kept off the CI path on purpose).

## What it provisions

- **Data Access audit log configs** for `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`, and `storage.googleapis.com` (DATA_READ + DATA_WRITE). Admin Activity is on by default; this turns on the *read*-side trail that catches enumeration, tfstate exfil, and similar reconnaissance. `iamcredentials.googleapis.com` is deliberately absent — that service rejects service-level audit config (its `GenerateAccessToken` events ship in Admin Activity already).
- **One project-level log exclusion** dropping audit entries on the LB's `default-404` bucket. Every internet scanner hitting an unknown URL would otherwise produce a `storage.objects.get` audit event; high volume, zero security signal. Bucket name is loaded from `//infra/cloud/gcp/lb:defs.bzl` so renames propagate automatically at bazel build time.
- **One email notification channel**, address sourced from `$TF_VAR_alert_email` (no email in source control).
- **Four log-match alert policies** on the WIF/SA path:

  | Alert | Filter shape | Why |
  |---|---|---|
  | `apply_impersonation_wif` | `iamcredentials.GenerateAccessToken` on `tf-apply`, ADMIN_READ side, `principalSubject` is set but not the prod-env subject | A WIF subject other than `repo:arkeros/senku:environment:prod` minted a tf-apply token. Either the principalSet binding was widened in `ci/defs.bzl`, or another OIDC subject was bound out-of-band. |
  | `apply_impersonation_nonwif` | Same as above but `principalSubject` is absent and `principalEmail` is not the apply SA itself | A non-WIF caller (human via `gcloud --impersonate-service-account`, or another SA with `serviceAccountTokenCreator`) impersonated tf-apply. |
  | `apply_setiampolicy` | Any `*.setIamPolicy` call where `principalEmail` is `tf-apply` | Steady-state apply rarely touches IAM. False positives expected when a PR genuinely adds an IAM resource — accept the noise for the signal. |
  | `wif_mutation` | Update/Delete on a resource matching `workloadIdentityPools/github` | This is the rebind-to-broad-scope path. CI never mutates these resources (bootstrap filter); only a human-driven local apply should. |

  The two `apply_impersonation_*` alerts are split rather than fused into one because their triage paths diverge — wrong WIF subject points at a binding mutation, non-WIF caller points at an SA-IAM-policy mutation. Splitting also avoids the absent-field semantic of `NOT field:"x"`: each filter expresses one yes/no question (subject set / subject absent) and answers it positively.

- **One meta-alert** on the alerting itself: a log-based metric counting all Data Access entries, plus an absence alert that fires after 23h30m of zero (the GCP-imposed maximum for absence-alert duration; longer durations are rejected by the API). Catches the "someone disabled the audit config" or "an exclusion was widened" failure modes that would otherwise leave the other alerts silent. Shorter windows (1h) flooded the inbox during normal idle stretches.

Each alert carries a `documentation` markdown block that lands in the notification body — written as a triage runbook for 3am, not a description of the filter.

## Apply

```bash
export TF_VAR_alert_email=you@example.com
bazel run //infra/cloud/gcp/audit:terraform.apply
```

Plan is non-blocking on a missing var (`terraform plan -input=false`), so it'll fail fast with "No value for required variable" rather than hang.

## Validate alert filters before apply

A log-match filter is a server-side string with no compile-time checks — `NOT field:"x"` matches absent fields, operator precedence is easy to miss, and a typo silently widens the filter. The first feedback signal otherwise is a 3am page (or worse, silence).

Before touching any alert filter, run:

```bash
bazel run //infra/cloud/gcp/audit:validate_alerts
```

It reads each `condition_matched_log` filter from the rendered `main.tf.json` and runs it against the last 7 days of real logs in `senku-prod`, printing match counts and a few sample timestamps. Cross-check the counts:

- **0** — fine for filters that catch rare events (`apply_impersonation_wif`, `apply_impersonation_nonwif`, `wif_mutation`).
- **A handful** — sanity-check the samples against recent activity (a real CI apply, your own manual alert verification per the section below). Expected for `apply_setiampolicy` after PRs that touch IAM.
- **A flood** — the filter is wrong (almost certainly a false-positive pattern). Don't apply until you've narrowed it.

Pass `--strict` to exit non-zero if any alert has matches; useful as a pre-apply guard. The script needs an authenticated `gcloud` (any account with `logging.entries.list` on `senku-prod`).

## Manual alert verification

The filters were written against documented audit log schemas, not against observed entries. Verify each fires at least once after apply.

### `apply_impersonation_nonwif` — safe, recommended

Mint a token for `tf-apply` from your own account:

```bash
gcloud auth print-access-token \
  --impersonate-service-account=github-actions-senku-apply@senku-prod.iam.gserviceaccount.com \
  --project=senku-prod
```

Generates a `GenerateAccessToken` event whose ADMIN_READ entry has no `principalSubject` (you're not a federated identity), so it matches the non-WIF alert. Email should arrive within a minute or two (Cloud Monitoring polling delay + email delivery).

You don't need to *use* the token — minting it is enough to fire the alert.

### `apply_impersonation_wif` — covered by review of the WIF binding

Hard to test safely without temporarily widening the principalSet binding (which would itself fire `wif_mutation` and leave a window where a non-prod GitHub job could mint apply-SA tokens). Don't do this casually.

If you must verify end-to-end after a GCP audit-log schema change: `bazel run //infra/cloud/gcp/ci:terraform.apply` from a working tree where `TF_APPLY_WIF_BINDING.member` is temporarily widened to `attribute.environment/pr-plan`, run a `pr-plan` job that calls `gcloud auth print-access-token` against `tf-apply`, then revert the binding and re-apply. Both transitions also fire `wif_mutation`, which is the expected belt-and-suspenders.

For routine releases, treat the binding's match against `ci/defs.bzl` (which a `terraform plan` would catch) plus the `wif_mutation` alert as sufficient indirect verification — `apply_impersonation_wif` is the second layer of defense for an attacker who has already gotten past those.

### `wif_mutation` — safe, reversible

Touch the github WIF pool with a no-op description change:

```bash
# Trigger
gcloud iam workload-identity-pools update github \
  --project=senku-prod --location=global \
  --description="alert-test $(date +%s)"

# Revert (or run terraform apply to reset to declared state)
gcloud iam workload-identity-pools update github \
  --project=senku-prod --location=global \
  --description="GitHub Actions"
```

Both calls fire the alert (one for each `UpdateWorkloadIdentityPool` event). Keep the second handy so the resource ends in its declared state — otherwise the next `terraform plan` will flag drift.

### `apply_setiampolicy` — wait for natural occurrence

Triggering this safely from outside CI is awkward (you'd have to impersonate `tf-apply` *and* call setIamPolicy, which would also fire `apply_impersonation` and create real IAM changes). Easier: leave it untested and wait for the next PR that genuinely adds an IAM resource. The first apply on main after merge will fire the alert. If the email arrives, the filter works.

### `data_access_silence` — wait ~24h

Hard to test without breaking the audit config. Trust the design: any tfstate read, bazel cache fetch, or terraform plan produces a Data Access entry, so 23h30m of absence means either tampering or a genuinely idle stretch. To force a test, you'd need to disable one of the audit configs and wait a day — not worth it.

## Caveats

- **Single channel = single point of failure.** All five alerts route to one email channel. If email rolls to spam or the inbox is unattended, alerts vanish silently. Adding SMS or PagerDuty as a second channel is the obvious hardening.
- **Filters are field-name dependent.** GCP has changed audit log schemas before. If `principalSubject` or `methodName` formats shift in a future release, the filters silently stop matching. Re-run the impersonation verification after any GCP IAM API release notes that mention audit log changes.
- **Rate limit is 5 minutes per alert.** Bursty patterns will dedupe — acceptable trade-off for not flooding the inbox.
