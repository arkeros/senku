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

## dag

Print the deploy order without running any of it.

```bash
aspect dag        # what `aspect apply` would walk, in order
CI=1 aspect dag   # the same, as CI would see it (bootstrap roots dropped)
```

Read-only: `bazel query` and nothing else — no terraform, no credentials, no
state. Exits non-zero if the graph has a cycle, naming the nodes involved.

## The deploy DAG

There is no list. Both tasks discover the graph with one `bazel query` and
topologically sort it. A node is a target of a node rule, and everything
needed to walk it is an attribute of that target:

| | Meaning |
| --- | --- |
| `tf_root_node` | A deployable Terraform root. Run via its `.apply`. |
| `tf_deploy_task` | Any other node. Run the target itself. |
| `bootstrap` | Skipped under `$CI`; applied locally only. |
| `deploy_after` | Nodes that must finish first. |

Membership is the rule class: `deploy = False` emits a plain `filegroup`, so
it is not a node at all. Edges are checked by Bazel — `deploy_after` requires
`TfDeployInfo`, so a bad label fails the *build*, citing the BUILD line.

```bash
aspect dag                                          # the order, without running it
CI=1 aspect dag                                     # what CI would walk
bazel query 'attr(deploy_after, "//x:y", //...)'    # what waits on //x:y
bazel query 'kind("tf_root_node|tf_deploy_task", //...)'  # every node
```

Nodes are **operations, not roots** — a container-image push is a node in its
own right, which is what lets an edge name the thing that actually holds the
dependency. An app's push needs the registry to exist; the app's Terraform
does not. It also means every push sorts ahead of every apply, so a registry
problem fails before any infrastructure is touched.

`aspect apply` walks the whole graph. `aspect plan` walks only the roots —
there is no plan for pushing an image.

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

Nothing. A new `tf_root` is in the graph by default, `registry_push` puts its
push behind the registry, and naming the digest with `image_uri()` puts the
root behind its push. Run `aspect dag` to see where it landed.

You only declare something when the default is wrong:

- **It's an example or fixture** → `deploy = False`. Also give it a backend
  bucket that cannot resolve, so a hand-run apply dies in `terraform init`
  rather than relying on the orchestrator to exclude it.
- **It provisions CI's own credentials** → `bootstrap = True`.
- **Its GCP resources must exist before another node's** → have the other
  node `ref()` the value it needs. The reference is the edge, so nothing is
  declared twice. Fall back to a hand-written `deploy_after` only for a
  dependency no value passes through.

Note the last one is about *resources*, not `load()`: importing a constant
from another root is a build dependency, not a deploy one. See
[ADR 0008](../docs/adr/0008-derived-terraform-deploy-set.md).
