# `infra/cloud/gcp/lb` — shared external HTTPS load balancer

Singleton root stack. One global external HTTPS LB fronting Cloud Run services, with path-based routing on one configurable domain. No services are provisioned here — this stack only owns the LB. Service roots expose an `LB_BACKEND` Starlark constant from their own `defs.bzl` (see [`oci/cmd/registry/defs.bzl`](../../../../oci/cmd/registry/defs.bzl) for the canonical example), and this stack imports them directly via `load()` in [`infra/cloud/gcp/lb/defs.bzl`](./defs.bzl). No `terraform_remote_state`: cross-root coupling resolves at Bazel build time, not Terraform plan time.

## Topology

```
user → LB IP (anycast)  ── :443 ──► URL map (HTTPS)        ── host+path rule ─► backend_service ─┬─► NEG (region A) → Cloud Run
                        └─ :80  ──► URL map (HTTP redirect) ── 301 ────────────► https://…       ├─► NEG (region B) → Cloud Run
                                                            └── unmatched ────► 404 (GCS bucket) └─► NEG (region C) → Cloud Run
```

- **Per backend**: one `google_compute_backend_service` + one `google_compute_region_network_endpoint_group` **per region** the backend declares. NEGs are emitted as one resource per `(backend_key, region)` pair via Starlark expansion of `BACKENDS` in `defs.bzl`.
- **Regional fan-out** is first-class: a service root's `LB_BACKEND` constant declares `service_name = "<name>"` and `regions = ["us-central1", "europe-west3", …]` — one Cloud Run service name, many regions — and Google's global LB does the geo-steering.
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

Bucket (`senku-prod-terraform-state`) and prefix (`infra/cloud/gcp/lb`) are baked into the generated `backend.tf.json` by `tf_root` (defaults to `native.package_name()`). Convention across the repo: one shared state bucket, prefix mirrors the root's path in the repo. Each root's state is independent — there's no cross-root state read at plan time.

## Usage

LB identity (project, domain, bucket location) is declared as Starlark constants at the top of [`defs.bzl`](./defs.bzl). The list of backends contributing to this LB lives in the `BACKENDS` dict in the same file — to add a service, import its `LB_BACKEND` constant and add an entry.

Plan / apply this root alone:

```bash
bazel run //infra/cloud/gcp/lb:terraform.plan
bazel run //infra/cloud/gcp/lb:terraform.apply
```

Or the whole DAG at once (gar → registry → lb), which is what CI does:

```bash
aspect plan
aspect apply
```

