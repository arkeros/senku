# `infra/cloud/gcp/lb` — shared external HTTPS load balancer

Singleton root stack. One global external HTTPS LB fronting Cloud Run services, with path-based routing on one configurable domain. No services are provisioned here — this stack only owns the LB; backends are declared via the `backends` variable and are created out-of-band (see [`examples/hello/`](./examples/hello) for a working companion stack).

## Topology

```
user → LB IP (anycast)  ── :443 ──► URL map (HTTPS)        ── host+path rule ─► backend N → NEG → Cloud Run service
                        └─ :80  ──► URL map (HTTP redirect) ── 301 ────────────► https://<same-url>
                                                            └── unmatched ────► 404 (empty GCS bucket)
```

- **Per-backend pair**: one `google_compute_region_network_endpoint_group` + one `google_compute_backend_service`, created via `for_each` over `var.backends`.
- **Per-region fan-out** of a single backend = add another NEG in the new region and an extra `backend` block on its backend service. No URL-map changes.
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

## State backend (Kubernetes)

```hcl
backend "kubernetes" {}
```

Filled via `-backend-config` at init. Prereq: cluster + namespace exist and `kubectl` is authenticated before `terraform init`.

```bash
terraform init \
  -backend-config="secret_suffix=prod" \
  -backend-config="namespace=terraform-state" \
  -backend-config="config_path=~/.kube/config" \
  -backend-config="config_context=senku-prod"
```

> **Bootstrap caveat:** this stack creates GCP infra; state lives in a cluster. If a cluster is part of your bootstrap, seed it (and this stack's Secret) from a separate bootstrap stack with a local/GCS backend first.

## Usage

```bash
cd infra/cloud/gcp/lb
terraform init -backend-config=…
terraform apply \
  -var="project_id=senku-prod" \
  -var="domain=api.senku.example.com" \
  -var='backends={
    v1 = { region = "europe-west1", service_name = "hello-v1", paths = ["/v1/*"] }
    v2 = { region = "europe-west1", service_name = "hello-v2", paths = ["/v2/*"] }
  }'
```

A companion stack at [`examples/hello/`](./examples/hello) provisions the two `service_cloudrun` services referenced above and exposes a `lb_backends` output shaped exactly like `var.backends` here.
