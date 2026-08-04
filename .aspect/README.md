# Aspect CLI Commands

Custom commands for the [Aspect CLI](https://docs.aspect.build/cli/).

These cover the orchestration layer above the Bazel build graph — chaining
`bazel run` invocations across multiple Terraform roots in dependency order.
Per Aspect's [outside-of-Bazel pattern](https://blog.aspect.build/outside-of-bazel-pattern),
multi-process orchestration belongs here, not inside the Bazel rules.

## plan

Plan one or more Terraform roots.

```bash
aspect plan                                              # all roots, in order
aspect plan //infra/cloud/gcp/gar:terraform              # one root
aspect plan //x:terraform --refresh=false                # skip the state refresh
aspect plan //x:terraform --target=module.foo.bar        # surgical plan; repeatable
```

Plans are serial. For parallel PR plans, CI runs each `aspect plan <root>`
in its own matrix job.

## apply

Apply one or more Terraform roots, in dependency order (gar → registry → lb).

```bash
aspect apply                                       # all roots, chained
aspect apply //oci/cmd/registry:terraform          # one root
aspect apply //x:terraform --refresh=false         # skip the state refresh
aspect apply //x:terraform --target=module.foo.bar # surgical apply; repeatable
```

Each root runs `bazel run <target>.apply`, which (for the registry)
also pushes the image to GAR via the `pre_apply` hook. Auto-approves when
`$CI` is set; prompts y/n locally.

### Long-tail terraform flags

`--refresh` and `--target` cover the common cases. Other terraform flags
(`-lock-timeout`, `-parallelism`, `-replace`, `-detailed-exitcode`, …)
aren't promoted to first-class options yet — reach them via the
underlying runnable:

```bash
bazel run //x:terraform.plan -- -lock-timeout=5m
```

## The deploy set

There is no list. Both tasks discover which roots to walk by querying the
build graph for tags that each `tf_root` publishes about itself:

| Tag | Meaning |
| --- | --- |
| `tf-root` | Is a Terraform root. Marks every one, deployable or not. |
| `tf-deploy` | Belongs to the deploy set. Present unless `deploy = False`. |
| `tf-bootstrap` | Skipped under `$CI`; applied locally only. |
| `tf-tier=<n>` | Deploy-order bucket, ascending. Single digit. |

```bash
bazel query 'attr(tags, "tf-deploy", //...)'    # what would be applied
bazel query 'attr(tags, "tf-tier=2", //...)'    # what goes last
```

Roots apply tier by tier. Within a tier the order is alphabetical and must
not matter — if two roots in a tier ever depend on each other, the fix is a
tier boundary between them, not a lucky sort.

## Bootstrap roots

`bootstrap = True` marks a root that provisions the CI identity itself —
the WIF binding, the GHA service account, the project IAM every other root
depends on. `aspect plan` / `aspect apply` skip these under `$CI` and
announce the skip on stderr, so a CI log explains its own gaps. A botched
CI-side apply could revoke the SA's own permissions and leave CI unable to
recover.

Locally both tasks walk the full DAG, bootstrap roots included — the filter
only applies when `$CI` is set.

## Adding a root

Nothing. A new `tf_root` is in the deploy set by default, and
`tf_root_with_image` already places image-pushing roots after the registry.

You only declare something when the default is wrong:

- **It's an example or fixture** → `deploy = False`. Also give it a backend
  bucket that cannot resolve, so a hand-run apply dies in `terraform init`
  rather than relying on the orchestrator to exclude it.
- **It provisions CI's own credentials** → `bootstrap = True`.
- **Its GCP resources must exist before another root's** → raise that other
  root's `deploy_tier`. Note this is about *resources*, not `load()`:
  importing a constant from another root is a build dependency, not a deploy
  one. See [ADR 0008](../docs/adr/0008-derived-terraform-deploy-set.md).
