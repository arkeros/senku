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

Each root runs `bazel run --stamp <target>.apply`, which (for the registry)
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

## Bootstrap roots

`BOOTSTRAP_ROOTS` in `.aspect/stdlib.axl` is the subset of `TF_ROOTS` that
`aspect plan` and `aspect apply` skip when running under `$CI`. Today
that's just `//infra/cloud/gcp/ci:terraform` — the WIF + GHA SA + project
IAM bindings every other root depends on. Apply it locally only: a
botched CI-side apply could revoke the SA's own permissions and leave CI
unable to recover.

Locally, `aspect plan` / `aspect apply` walk the full DAG (including
bootstrap roots) — the filter only kicks in when `$CI` is set.

## Adding a root

1. Add the new `tf_root` target to `.aspect/stdlib.axl`'s `TF_ROOTS` list,
   in the position that matches its GCP-level dependencies.
2. If the root manages credentials or anything else CI shouldn't touch
   on its own, add it to `BOOTSTRAP_ROOTS` too.
