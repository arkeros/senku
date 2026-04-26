# `infra/cloud/gcp/ci` — CI identity infrastructure

Bootstrap-tier root. Provisions the Workload Identity Federation pool, GitHub OIDC provider, the two GitHub Actions service accounts, and the project-level IAM grants every other root depends on. Applied locally only — `aspect plan` / `aspect apply` skip this root under `$CI` so the apply SA never modifies its own identity infrastructure.

## Two SAs, two GitHub environments

```
                    GitHub OIDC token
                          │
                  ┌───────┴────────┐
   environment:   │                │
   `pr-plan`      │                │   `prod`
   (any branch,   │                │   (main only,
   no reviewers)  │                │    required reviewers)
                  ▼                ▼
       attribute.environment    attribute.environment
            /pr-plan                 /prod
                  │                │
                  ▼                ▼
            tf-plan SA         tf-apply SA
            (read-only)        (resource-plane admin,
                                no identity-plane)
```

The split moves the branch/reviewer gate from the workflow YAML (which any committer can edit) to the GitHub identity layer (configured in repo settings, separate credential surface). The principalSet binding for each SA is keyed on `attribute.environment/<name>`, so GitHub validates the environment's protection rules *before* minting the OIDC token. A token bound to one environment cannot impersonate the SA of the other.

## Role split: identity plane vs resource plane

`tf-apply` deliberately does **not** carry `iam.workloadIdentityPoolAdmin` or `iam.serviceAccountAdmin`. This whole root is bootstrap-tier (applied locally only), so terraform never needs the apply SA to manage identity-plane resources from CI.

The consequence: a compromised apply token cannot rebind itself to a wider principalSet, can't create new SAs, can't widen another SA's bindings. Direct IAM API calls to those endpoints fail with `PERMISSION_DENIED`. The branch/reviewer gates protecting the SA can't be rewritten by the SA itself.

`tf-plan` carries `viewer`, `iam.securityReviewer`, and `serviceUsageConsumer` (project-wide read), plus `storage.objectAdmin` on the cache and tfstate buckets (state lock + read for plan).

## Required GitHub configuration

These are repo-level settings that terraform doesn't touch — configure them in `Settings → Environments` on github.com **before** the next CI push, otherwise jobs deadlock waiting for an environment that doesn't exist or doesn't have reviewers.

### `pr-plan` environment

- **Deployment branches**: `All branches` (PRs come from any branch).
- **Required reviewers**: none. Plan is read-only by design — gating it on review would block PR feedback for no security gain.
- **Wait timer**: none.

### `prod` environment

- **Deployment branches**: `Selected branches and tags` → add `main`. PRs from any branch can declare `environment: prod` in YAML, but GitHub will refuse to start the job unless the ref is `main`.
- **Required reviewers**: at least one CODEOWNER. The reviewer's approval is what mints the token.
- **Wait timer**: optional, 5 min recommended for last-chance abort.

## Apply order (first time and after changes)

1. Apply `infra/cloud/gcp/audit/` first — Data Access logs need to be on before WIF/SA changes are applied, otherwise the rebind itself goes unlogged.
2. Apply this root: `bazel run //infra/cloud/gcp/ci:terraform.apply`.
3. Configure the two GitHub environments per above (one-time, but verify after any change to either environment in GitHub).
4. Verify the audit alerts fire (see `infra/cloud/gcp/audit/README.md`).
5. Push to main; first CI apply runs against the new identities.

## State backend

Bucket `senku-prod-terraform-state`, prefix `infra/cloud/gcp/ci`. Provisioned out of band (chicken-and-egg: this root configures the SAs that other roots use to write state, so this root's state predates everything).
