# `infra/cloud/gcp/lb` — shared external HTTPS load balancer

Singleton root stack. One global external HTTPS load balancer fronting Cloud Run services, with path-based routing (`/v1/*`, `/v2/*`) on a single domain.

This is the *instantiation* of the GLB pattern — not a reusable module. The `service_cloudrun` module at [`devtools/bifrost/terraform/modules/service_cloudrun`](../../../../devtools/bifrost/terraform/modules/service_cloudrun) is reusable; there is only ever one LB per environment, so it lives here as a concrete root stack instead.

## Topology

```
user → LB IP (anycast)
        ├── /v1/* → backend_hello_v1 → serverless-NEG → Cloud Run (hello-v1, europe-west1)
        └── /v2/* → backend_hello_v2 → serverless-NEG → Cloud Run (hello-v2, europe-west1)
```

Each service is attached via a serverless NEG. The backend services are per-service, not per-route, so adding a new region to a service means adding one more NEG and one more `backend` block inside the existing backend service — no URL-map changes.

## Cloud Run ingress recipe

The sample services are configured `public = true` + `ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`. That combination is the canonical "behind an external HTTPS LB" shape:

- `public = true` grants `allUsers → roles/run.invoker`, so the LB can invoke without injecting identity on the hop.
- `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` rejects direct `*.run.app` traffic — the only ingress path is via the LB.

For private services that require caller identity, you would swap to IAM-authenticated NEGs, which is out of scope here.

## Adding regions

Pick a service, then:

1. Add a second `module "hello_v1_eu"` (or wherever) with a different `region`.
2. Add a second `google_compute_region_network_endpoint_group "hello_v1_eu"` pointing at the new service.
3. Add a second `backend { group = google_compute_region_network_endpoint_group.hello_v1_eu.id }` inside `google_compute_backend_service.hello_v1`.

The LB's geo-routing will then pick the closest healthy NEG per request. No URL-map changes needed.

## Adding domains

The LB is shared across domains — don't create a second LB.

1. Add `google_compute_managed_ssl_certificate` (or switch to `google_certificate_manager_certificate` with SAN if you'll exceed 15 domains).
2. Attach it to the target proxy's `ssl_certificates` list.
3. Add a `host_rule` + `path_matcher` to the URL map for the new domain.

## DNS

Point an A record for `var.domain` at the `lb_ip` output. Managed cert provisioning only completes once DNS resolves — allow 10–60 min from DNS change to first successful TLS handshake.

## Usage

```bash
cd infra/cloud/gcp/lb
terraform init
terraform apply -var="project_id=senku-prod" -var="domain=api.senku.example.com"
```
