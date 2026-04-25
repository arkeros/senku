# `infra/cloud/gcp/lb` — shared external HTTPS load balancer

Singleton root stack. One global external HTTPS LB fronting Cloud Run services, with path-based routing on one configurable domain. No services are provisioned here — this stack only owns the LB. Each service root (see [`examples/hello/`](./examples/hello)) exposes an `lb_backends` output, and this stack reads those outputs via `terraform_remote_state`; the roots it should read are listed in `var.backend_states`.

## Topology

```
user → LB IP (anycast)  ── :443 ──► URL map (HTTPS)        ── host+path rule ─► backend_service ─┬─► NEG (region A) → Cloud Run
                        └─ :80  ──► URL map (HTTP redirect) ── 301 ────────────► https://…       ├─► NEG (region B) → Cloud Run
                                                            └── unmatched ────► 404 (GCS bucket) └─► NEG (region C) → Cloud Run
```

- **Per backend**: one `google_compute_backend_service` + one `google_compute_region_network_endpoint_group` **per region** the backend declares. NEGs are `for_each`'d over the flattened `(backend_key, region)` pairs of the merged `local.backends`.
- **Regional fan-out** is first-class: a service root declares `service_name = "<name>"` and `regions = ["us-central1", "europe-west3", …]` in its `lb_backends` output — one Cloud Run service name, many regions — and Google's global LB does the geo-steering.
- **Per-domain fan-out** = add a `google_certificate_manager_certificate_map_entry` with a matcher clause and a new `host_rule`/`path_matcher` on the HTTPS URL map.

## Certificate Manager, not classic managed certs

The stack uses `google_certificate_manager_certificate` + certificate map indirection rather than `google_compute_managed_ssl_certificate` because:

- Classic certs cap at **15 per target proxy**. Cert Manager is effectively unlimited (via cert maps).
- Cert Manager supports DNS-01 authorization → wildcards and DNS-pre-cutover issuance. Classic is HTTP-01 only and blocks until DNS resolves to the LB.
- One Cert Manager cert can front multiple LBs (cert map sharing).
- Free for the first 100 certs per project; ~$0.20/cert/month beyond that.

Same operational behaviour (auto-renewal, Google-managed private key) for the common case, strictly more capability when the stack grows.

## 404 default

The URL map's `default_service` points at an empty `google_storage_bucket` via a `google_compute_backend_bucket`. Unmatched paths get a 404 from GCS, not a silent fall-through to some backend. Swap the bucket contents to serve a landing page later; the bucket name is exported as `default_404_bucket`.

## State backend (GCS)

Bucket (`senku-prod-terraform-state`) and prefix (`infra/cloud/gcp/lb`) are hardcoded in `versions.tf`, so `terraform init` takes no flags. Convention across the repo: one shared state bucket, prefix mirrors the root's path in the repo. GCS is required so each service root's own GCS-backed state can be read by this stack through `terraform_remote_state`.

## Usage

Inputs live in `terraform.tfvars` next to this README — Terraform auto-loads it, so no `-var-file` flag. `-var` on the CLI is avoided so every apply has a reviewable input artifact.

`terraform.tfvars`:

```hcl
project_id = "senku-prod"
domain     = "distroless.io"

backend_states = {
  registry = "oci/cmd/registry/terraform"
}
```

Apply:

```bash
cd infra/cloud/gcp/lb
terraform init
terraform apply
```

A companion stack at [`examples/hello/`](./examples/hello) provisions two `service_cloudrun` services and exposes an `lb_backends` output that this stack merges in. Adding a second service root is the same shape: apply it, then add another `backend_states` entry (key = friendly name, value = the root's repo path).
