# `infra/cloud/gcp/audit` — project-level audit logs and security alerts

Bootstrap-tier root. Applied locally only — `aspect plan` / `aspect apply` skip it under `$CI` because the apply SA isn't allowed to mutate audit config or alerts (one of the things a compromise tries to disable, kept off the CI path on purpose).

## What it provisions

- **Data Access audit log configs** for `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`, and `storage.googleapis.com` (DATA_READ + DATA_WRITE). Admin Activity is on by default; this turns on the *read*-side trail that catches enumeration, tfstate exfil, and similar reconnaissance. `iamcredentials.googleapis.com` is deliberately absent — that service rejects service-level audit config (its `GenerateAccessToken` events ship in Admin Activity already).
- **One project-level log exclusion** dropping audit entries on the LB's `default-404` bucket. Every internet scanner hitting an unknown URL would otherwise produce a `storage.objects.get` audit event; high volume, zero security signal. Bucket name is loaded from `//infra/cloud/gcp/lb:defs.bzl` so renames propagate automatically at bazel build time.
- **One email notification channel**, address sourced from `$TF_VAR_alert_email` (no email in source control).
- **Three log-match alert policies** on the WIF/SA path:

  | Alert | Filter shape | Why |
  |---|---|---|
  | `apply_impersonation` | `iamcredentials.GenerateAccessToken` on `tf-apply` SA, where `principalSubject` doesn't contain `repo:arkeros/senku:environment:prod` | Catches any impersonation that isn't the prod GitHub environment — different WIF subject, human via `gcloud --impersonate-service-account`, or another SA with `serviceAccountTokenCreator`. |
  | `apply_setiampolicy` | Any `*.setIamPolicy` call where `principalEmail` is `tf-apply` | Steady-state apply rarely touches IAM. False positives expected when a PR genuinely adds an IAM resource — accept the noise for the signal. |
  | `wif_mutation` | Update/Delete on a resource matching `workloadIdentityPools/github` | This is the rebind-to-broad-scope path. CI never mutates these resources (bootstrap filter); only a human-driven local apply should. |

- **One meta-alert** on the alerting itself: a log-based metric counting all Data Access entries, plus an absence alert that fires after an hour of zero. Catches the "someone disabled the audit config" or "an exclusion was widened" failure modes that would otherwise leave the other alerts silent.

Each alert carries a `documentation` markdown block that lands in the notification body — written as a triage runbook for 3am, not a description of the filter.

## Apply

```bash
export TF_VAR_alert_email=you@example.com
bazel run //infra/cloud/gcp/audit:terraform.apply
```

Plan is non-blocking on a missing var (`terraform plan -input=false`), so it'll fail fast with "No value for required variable" rather than hang.

## Manual alert verification

The filters were written against documented audit log schemas, not against observed entries. Verify each fires at least once after apply.

### `apply_impersonation` — safe, recommended

Run a non-prod-environment impersonation by hand (you, the human, minting a token for `tf-apply`):

```bash
gcloud auth print-access-token \
  --impersonate-service-account=github-actions-senku-apply@senku-prod.iam.gserviceaccount.com \
  --project=senku-prod
```

This generates a `GenerateAccessToken` event with `principalEmail = <your email>` and no `principalSubject`, which doesn't contain `:environment:prod`, so the filter matches. Email should arrive within a minute or two (Cloud Monitoring polling delay + email delivery).

You don't need to *use* the token — minting it is enough to fire the alert.

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

### `data_access_silence` — wait an hour

Hard to test without breaking the audit config. Trust the design: the metric is updating continuously (any tfstate read or bazel cache fetch produces a Data Access entry), so absence for >1h means tampering. To force a test, you'd need to disable one of the audit configs and wait — not worth it.

## Caveats

- **Single channel = single point of failure.** All four alerts route to one email channel. If email rolls to spam or the inbox is unattended, alerts vanish silently. Adding SMS or PagerDuty as a second channel is the obvious hardening.
- **Filters are field-name dependent.** GCP has changed audit log schemas before. If `principalSubject` or `methodName` formats shift in a future release, the filters silently stop matching. Re-run the impersonation verification after any GCP IAM API release notes that mention audit log changes.
- **Rate limit is 5 minutes per alert.** Bursty patterns will dedupe — acceptable trade-off for not flooding the inbox.
