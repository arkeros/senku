# `examples/hello` — sample Cloud Run services illustrating the LB integration

Two `service_cloudrun` services (`hello-v1`, `hello-v2`) deployed in a single region, wired with the "behind an external LB" ingress recipe. **Standalone Terraform sample** — illustrates the *resource shape* a service root needs to participate in the shared LB. Not wired into the sibling [`../..`](../..) LB stack (that stack imports backend descriptors directly via Starlark `load()` from each in-repo service root's `defs.bzl`; there's no `terraform_remote_state` link).

## Why a separate root?

The LB is a singleton per environment; these services are not. Keeping them in separate Terraform roots means:

- Services can be applied and rolled without touching the LB.
- The LB state doesn't churn on every image bump.
- Multiple examples / teams can share the same LB by exposing an `LB_BACKEND` constant from their service root's `defs.bzl` and adding an entry to the LB's `BACKENDS` dict in `infra/cloud/gcp/lb/defs.bzl`.

## Usage

This sample is a vanilla Terraform root; apply it like any other:

```bash
cd infra/cloud/gcp/lb/examples/hello
terraform init
terraform apply
```

To wire a real service into the shared LB, follow the registry's pattern instead — see [`oci/cmd/registry/defs.bzl`](../../../../../oci/cmd/registry/defs.bzl) for the canonical `LB_BACKEND` shape and [`infra/cloud/gcp/lb/defs.bzl`](../../defs.bzl)'s `BACKENDS` dict for how it gets imported.
