# `examples/hello` — sample Cloud Run services for the LB stack

Two `service_cloudrun` services (`hello-v1`, `hello-v2`) deployed in a single region, wired with the "behind an external LB" ingress recipe. Exists to give the sibling [`../..`](../..) LB stack something to front without tying the two together in one root.

## Why a separate root module?

The LB is a singleton per environment; these services are not. Keeping them in separate Terraform roots means:

- Services can be applied and rolled without touching the LB.
- The LB state doesn't churn on every image bump.
- Multiple examples / teams can share the same LB by adding another entry to its `backend_states` var.

The bridge between the two roots is the `lb_backends` output here: the LB stack reads it directly via `terraform_remote_state`, so there is no tfvars file to keep in sync.

## Usage

Each root is driven by a `terraform.tfvars` file checked in next to it — auto-loaded by Terraform, so no `-var-file` flag is needed. State backend (bucket + prefix) is hardcoded in `versions.tf`, so `terraform init` takes no flags either. Repo convention: one shared state bucket, prefix mirrors the root's path in the repo.

`infra/cloud/gcp/lb/examples/hello/terraform.tfvars`:

```hcl
project_id = "senku-prod"
```

`infra/cloud/gcp/lb/terraform.tfvars`:

```hcl
project_id = "senku-prod"
domain     = "api.senku.example.com"

backend_states = {
  hello = "infra/cloud/gcp/lb/examples/hello"
}
```

Apply order — services first, LB second:

```bash
# 1. Services.
cd infra/cloud/gcp/lb/examples/hello
terraform init
terraform apply

# 2. LB (reads the hello root's state via terraform_remote_state).
cd ../..
terraform init
terraform apply
```

Adding a second service root: apply it, then extend `backend_states` in the LB's tfvars with another key (key = friendly name, value = the root's repo path). The LB merges every root's `lb_backends` output into one set of backends.
