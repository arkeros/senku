# `examples/hello` — sample Cloud Run services for the LB stack

Two `service_cloudrun` services (`hello-v1`, `hello-v2`) deployed in a single region, wired with the "behind an external LB" ingress recipe. Exists to give the sibling [`../..`](../..) LB stack something to front without tying the two together in one root.

## Why a separate root module?

The LB is a singleton per environment; these services are not. Keeping them in separate Terraform roots means:

- Services can be applied and rolled without touching the LB.
- The LB state doesn't churn on every image bump.
- Multiple examples / teams can share the same LB by appending to its `backends` var.

The bridge between the two roots is the `lb_backends` output here, shaped exactly like the LB stack's `var.backends`.

## Usage

```bash
# 1. Apply the services.
cd infra/cloud/gcp/lb/examples/hello
terraform init
terraform apply -var="project_id=senku-prod"

# 2. Pipe the lb_backends output into the LB stack's tfvars.
terraform output -json lb_backends > ../../backends.auto.tfvars.json

# 3. Apply the LB.
cd ../..
terraform apply \
  -var="project_id=senku-prod" \
  -var="domain=api.senku.example.com"
```

Step 2 can be automated in CI. In fancier setups, substitute it with a `terraform_remote_state` data source in the LB stack.
