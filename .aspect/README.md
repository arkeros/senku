# Aspect CLI Commands

Custom commands for the [Aspect CLI](https://docs.aspect.build/cli/).

These cover the orchestration layer above the Bazel build graph — chaining
`bazel run` invocations across multiple Terraform roots in dependency order.
Per Aspect's [outside-of-Bazel pattern](https://blog.aspect.build/outside-of-bazel-pattern),
multi-process orchestration belongs here, not inside the Bazel rules.

## plan

Plan one or more Terraform roots.

```bash
aspect plan                                  # all roots, in order
aspect plan //infra/cloud/gcp/gar:terraform  # one root
```

Plans are serial. For parallel PR plans, CI runs each `aspect plan <root>`
in its own matrix job.

## apply

Apply one or more Terraform roots, in dependency order (gar → registry → lb).

```bash
aspect apply                                  # all roots, chained
aspect apply //oci/cmd/registry:terraform     # one root
```

Each root runs `bazel run --stamp <target>.apply`, which (for the registry)
also pushes the image to GAR via the `pre_apply` hook. Auto-approves when
`$CI` is set; prompts y/n locally.

## Adding a root

1. Add the new `tf_root` target to `.aspect/stdlib.axl`'s `TF_ROOTS` list,
   in the position that matches its GCP-level dependencies.
2. Mirror the position in CI's `needs:` graph for the apply chain.

The list is the single source of truth for deploy order; CI's `needs:`
graph is its mechanical reflection for per-step UI.
