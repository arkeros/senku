# `infra/cloud/gcp/lb` — shared external HTTPS load balancer

Singleton root stack. One global external HTTPS LB fronting two kinds of origin — Cloud Run services and GCS buckets — with path-based routing on one configurable domain. No services are provisioned here — this stack only owns the LB. Service roots expose an `LB_BACKEND` Starlark constant from their own `defs.bzl` (see [`oci/cmd/registry/defs.bzl`](../../../../oci/cmd/registry/defs.bzl) for the canonical example), and this stack imports them directly via `load()` in [`infra/cloud/gcp/lb/defs.bzl`](./defs.bzl). No `terraform_remote_state`: cross-root coupling resolves at Bazel build time, not Terraform plan time.

## Topology

```
user → LB IP (anycast)  ── :443 ──► URL map (HTTPS)        ── host+path rule ─┬─► backend_service ─┬─► NEG (region A) → Cloud Run
                        └─ :80  ──► URL map (HTTP redirect) ── 301 ───────────│──► https://…      ├─► NEG (region B) → Cloud Run
                                                            └── unmatched ────│──► 404 (bucket)   └─► NEG (region C) → Cloud Run
                                                                              └─► backend_bucket ───► GCS bucket (static site)
```

- **Two drivers.** `LB_BACKEND` declares `driver`, defaulting to `"cloudrun"`. It is `driver` rather than `kind` because bifrost reserves `kind` for what an app *is* (`StaticSite` vs `Runtime`) and `driver` for how it is realised — and the LB is choosing the latter. The five games were `StaticSite`s before this migration and after it; only their driver changed. They share no mechanism — a Cloud Run origin is reached through a serverless NEG wrapped in a backend service, a bucket through a backend bucket — so collapsing them would mean a descriptor whose fields are each meaningful for only half its values. `_normalize` rejects a `gcs-cdn` backend that declares `regions` or `service_name` rather than ignoring it.
- **`driver = "cloudrun"`**: one `google_compute_backend_service` + one `google_compute_region_network_endpoint_group` **per region** the backend declares. NEGs are emitted as one resource per `(backend_key, region)` pair via Starlark expansion of `BACKENDS` in `defs.bzl`. Regional fan-out is first-class — one service name, many regions, and Google's global LB does the geo-steering.
- **`driver = "gcs-cdn"`**: one `google_compute_backend_bucket`, no regions and no health check, because there is nothing running to find or check. The host's path matcher also gets a `custom_error_response_policy` serving `/index.html` as the body of the 404: that is the SPA history-API fallback, which used to be `try_files` inside each app's nginx. The status is **not** overridden — a path the bucket has no object for is one the site does not serve, so it says so, and the app's `*` route renders its own not-found page under it. A *declared* route returns 200 because the webroot holds a route object at that path, not because the policy rewrites anything. See [ADR 0009](../../../../docs/adr/0009-frontends-are-served-from-buckets.md) and [ADR 0011](../../../../docs/adr/0011-honest-status-codes.md).
- **Per-domain fan-out** is derived, not hand-written. A backend's `LB_BACKEND` may name a `host`; anything that doesn't defaults to `DOMAIN`. `HOSTS` is the deduplicated result, and each host gets a managed certificate, a cert-map entry and a `host_rule`/`path_matcher` pair automatically.
- **Path rules vs. whole hosts**: within a host, a backend declaring `paths` becomes a `path_rule`; a backend declaring none becomes that host's `default_service` — the shape an SPA needs, since it owns every path. Only that owner gets the SPA fallback, and only if it is a bucket: a Cloud Run origin answers its own unknown paths, and the 404 bucket's whole job is to 404. At most one backend per host may omit `paths`, enforced with a `fail()` at load time.

## Certificate Manager, not classic managed certs

The stack uses `google_certificate_manager_certificate` + certificate map indirection rather than `google_compute_managed_ssl_certificate` because:

- Classic certs cap at **15 per target proxy**. Cert Manager is effectively unlimited (via cert maps).
- Cert Manager supports DNS-01 authorization → wildcards and DNS-pre-cutover issuance. Classic is HTTP-01 only and blocks until DNS resolves to the LB.
- One Cert Manager cert can front multiple LBs (cert map sharing).
- Free for the first 100 certs per project; ~$0.20/cert/month beyond that.

Same operational behaviour (auto-renewal, Google-managed private key) for the common case, strictly more capability when the stack grows.

Two things to know when adding a host:

- Issuance is **LB-authorized**, so a certificate stays `PROVISIONING` until that host's `A` record resolves to `lb_ip` and reaches this LB directly. A proxying CDN in front of the record (Cloudflare's orange cloud) terminates TLS itself, the validation never arrives, and the certificate never activates. DNS lives outside this repo — Cloud DNS isn't even enabled on the project.
- A cert map holds exactly **one `PRIMARY` entry** (the certificate served when SNI matches nothing else). `DOMAIN` claims it; every other host selects by `hostname`. That is the only place the primary domain is special-cased — plus a legacy-name shim so `DOMAIN`'s live certificate keeps the resource address and GCP name it was created under, since renaming either would destroy and recreate a working certificate.

## Verifying a `gcs-cdn` backend

`terraform validate` checks that the provider accepts the URL map; it says
nothing about what the LB does with it. After a cutover, four commands cover
the parts that fail silently (`dino` as the example):

```bash
# SPA fallback: an unknown route must be 404 with the app shell as the body
curl -sI https://dino.arquero.dev/no-such-route | head -1
#   want: HTTP/2 404
curl -sI https://dino.arquero.dev/no-such-route | grep -i 'content-type\|age'
#   want: text/html; charset=utf-8 — the shell, so the router renders NotFound

# A declared route is a real object, so it is a real 200
curl -sI https://dino.arquero.dev/ | head -1
#   want: HTTP/2 200

# The module script's type — a wrong one makes the ESM loader refuse it and
# the page renders blank
curl -sI https://dino.arquero.dev/app_bundle/app_main.js | grep -i 'content-type\|cache-control'
#   want: text/javascript; charset=utf-8  +  no-cache

# Headers actually landed on the objects, not just in the plan
gcloud storage objects describe gs://senku-prod-dino-meteor/index.html \
  --format='value(contentType,cacheControl)'
curl -sI https://dino.arquero.dev/manifest.webmanifest | grep -i content-type
#   want: application/manifest+json
```

`negative_caching` is on for both drivers, and its interaction with the
fallback is the one thing here nobody has watched in production: a bucket
404s on every client-routed path, and those 404s are what the policy attaches
the shell to. The client now receives the 404 as well as the body, so a
cached negative response is a cached *page*, not just a status. If it
misbehaves, drop `negative_caching` from `_CDN_POLICY` for the `gcs-cdn`
backends.

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

