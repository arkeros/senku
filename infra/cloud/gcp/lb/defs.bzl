"""Identity, derived strings, and resource declarations for the global LB.

The HTTP(S) load balancer fronts every origin that contributes a backend —
Cloud Run services and GCS buckets alike. Each contributor exposes an
`LB_BACKEND` constant from its own `defs.bzl` naming the `driver` that
realises it; this root aggregates them. That replaces the previous
`terraform_remote_state` data sources — same content, no runtime
indirection.
"""

load("@terraform.bzl", "output", "resource")
load("//apps/cluedo-bayes:defs.bzl", _CLUEDO_LB_BACKEND = "LB_BACKEND")
load("//apps/dino-meteor:defs.bzl", _DINO_LB_BACKEND = "LB_BACKEND")
load("//apps/napkin-battle:defs.bzl", _NAPKIN_LB_BACKEND = "LB_BACKEND")
load("//apps/pepper-sweeper:defs.bzl", _PADRON_LB_BACKEND = "LB_BACKEND")
load("//apps/spaghetti-duel:defs.bzl", _PASTA_LB_BACKEND = "LB_BACKEND")
load("//apps/table-for-two:defs.bzl", _TABLE_LB_BACKEND = "LB_BACKEND")

PROJECT = "senku-prod"

# Prefix for LB resource names (backend services, URL maps, cert, cert map,
# forwarding rules, global IP, 404 bucket). Distinct from any specific
# service so the LB is identifiable on its own.
NAME = "senku"

# Primary domain. It answers the cert map's PRIMARY entry — the certificate
# served when SNI matches no other entry — and is the default host for
# backends that don't name one. Additional hosts come from the backends
# themselves (see `_normalize`), each getting its own certificate and path
# matcher. Create an A record pointing at the `lb_ip` output for every host
# so the managed certs' LB-authorized issuance can complete.
DOMAIN = "distroless.io"

# Multi-region location for the empty bucket that serves the URL map's 404
# default. Cheapest per GB and effectively never read.
BUCKET_LOCATION = "EU"

# --- backends -----------------------------------------------------------------
# Map backend_key → backend descriptor. New services contributing to this LB
# add an entry here and an `LB_BACKEND` constant in their root.

# The drivers this LB knows how to realise an origin with. `driver`, not
# `kind`: bifrost's model reserves `kind` for what an app *is* — a
# `StaticSite` has no server, a `Runtime` does — and `driver` for how that
# thing is realised. Which one the LB is choosing between is the second
# question: it does not care whether an app has a server, only which GCP
# resource fronts it. (`kind` is also already spoken for in this repo, as
# the document type in //devtools/bifrost/api:types.go.)
#
# The five games were `StaticSite`s before this migration and after it; what
# changed was their driver. Only the registry is a `Runtime`.
#
# They stay separate drivers rather than one because they share no
# mechanism: a Cloud Run service is reached through a serverless NEG wrapped
# in a backend service, a bucket through a backend bucket, and neither
# resource accepts the other's configuration. Collapsing them would mean a
# descriptor whose fields are each meaningful for only half its values.
# The registry is deployed from github.com/arkeros/distroless by that repo's
# own CI — a Knative manifest applied with `gcloud run services replace`, not a
# Terraform root here. So it is named by literal rather than by `ref()`: there
# is no root in this repo to take a deploy edge on, and the service existing is
# that repo's invariant to keep, not this one's. If it has not been deployed,
# this LB's serverless NEG points at nothing and the plan still succeeds.
_REGISTRY_LB_BACKEND = {
    "paths": ["/v2/*"],
    "regions": [
        "asia-northeast1",
        "europe-west3",
        "us-central1",
    ],
    "service_name": "registry",
}

DRIVER_CLOUDRUN = "cloudrun"
DRIVER_GCS_CDN = "gcs-cdn"

def _normalize(backend):
    """Fill in the defaults contributors shouldn't have to think about.

    `driver` defaults to `DRIVER_CLOUDRUN` — it was the only one when the
    first backends were written, and defaulting keeps their descriptors
    reading the same as before.

    Regions get sorted because `google_compute_backend_service.backend[]`
    is order-significant in Terraform state, so an unsorted regions list at
    the source would silently churn the LB plan whenever a new region is
    appended. Sorting here makes the invariant the LB's responsibility —
    services can declare regions in any order (geographic, deploy-date,
    etc.) without knowing it matters downstream. `gcs-cdn` has no regions:
    one backend bucket fronts one bucket, and the CDN is what makes it
    global.

    `host` defaults to `DOMAIN`. Backends can't load it from here (this
    module already loads *them*, so importing back would be a cycle), which
    is why the default lives on this side: a service names a host only when
    it wants one of its own.
    """
    driver = backend.get("driver", DRIVER_CLOUDRUN)
    normalized = dict(backend, driver = driver, host = backend.get("host", DOMAIN))

    if driver == DRIVER_CLOUDRUN:
        normalized["regions"] = sorted(backend["regions"])
        return normalized

    if driver == DRIVER_GCS_CDN:
        # Catching this here rather than letting it pass through unused:
        # a `regions` list on a `gcs-cdn` backend means its author expected
        # regional fan-out, and silently dropping it would leave them
        # believing they had it.
        for unsupported in ("regions", "service_name"):
            if unsupported in backend:
                fail("%s backend %r declares %r, which only a %s backend has" %
                     (DRIVER_GCS_CDN, backend.get("host"), unsupported, DRIVER_CLOUDRUN))
        return normalized

    fail("backend %r has unknown driver %r; expected one of %r" %
         (backend.get("host"), driver, [DRIVER_CLOUDRUN, DRIVER_GCS_CDN]))

BACKENDS = {
    "cluedo": _normalize(_CLUEDO_LB_BACKEND),
    "dino": _normalize(_DINO_LB_BACKEND),
    "napkin": _normalize(_NAPKIN_LB_BACKEND),
    "padron": _normalize(_PADRON_LB_BACKEND),
    "pasta": _normalize(_PASTA_LB_BACKEND),
    "registry": _normalize(_REGISTRY_LB_BACKEND),
    "table": _normalize(_TABLE_LB_BACKEND),
}

# No deploy-edge list here. Each backend names its origin with a `ref()` in
# the contributing root's `defs.bzl` — `service_name` for `cloudrun`,
# `bucket_name` for `gcs-cdn` — so `tf_root` reads the edges out of the NEGs
# and backend buckets those names end up in. The value routed to and the
# node waited on are one token; there is no second list that could disagree
# with the first, and nothing to update when a backend is added.

def _host_slug(host):
    """Hostname → a name fragment valid in GCP resource names."""
    return host.replace(".", "-")

def _host_tf_name(host):
    """Hostname → a Terraform resource identifier."""
    return host.replace(".", "_").replace("-", "_")

def _of_driver(driver):
    return {k: b for k, b in BACKENDS.items() if b["driver"] == driver}

_CLOUDRUN_BACKENDS = _of_driver(DRIVER_CLOUDRUN)
_GCS_CDN_BACKENDS = _of_driver(DRIVER_GCS_CDN)

def _backends_on(host):
    return {k: b for k, b in BACKENDS.items() if b["host"] == host}

# Every host this LB serves, `DOMAIN` first. Dict-keys rather than a set so
# the order is deterministic across Starlark evaluations.
HOSTS = [DOMAIN] + sorted([
    h
    for h in {b["host"]: None for b in BACKENDS.values()}
    if h != DOMAIN
])

# Flattened {slug → entry} for one NEG per (backend, region). The slug is a
# valid Terraform identifier (no hyphens) so each NEG gets a non-bracketed
# resource address.
_NEG_ENTRIES = {
    "{}_{}".format(backend_key, region.replace("-", "_")): {
        "backend_key": backend_key,
        "region": region,
        "service_name": backend["service_name"],
    }
    for backend_key, backend in _CLOUDRUN_BACKENDS.items()
    for region in backend["regions"]
}

# --- 404 default -------------------------------------------------------------
# Empty GCS bucket fronted by a backend bucket. Used as the URL map's
# `default_service` so unmatched host+path requests return 404 (GCS serves
# 404 for any key that doesn't exist in the bucket). Avoids the trap where
# unmatched traffic silently lands on whichever backend was listed first.

# Public so downstream Starlark (e.g. the audit root's log-exclusion
# filter) can reference the canonical bucket name without re-deriving
# the format string.
DEFAULT_404_BUCKET_NAME = "{}-{}-lb-404".format(PROJECT, NAME)

_DEFAULT_404_BUCKET = resource(
    rtype = "google_storage_bucket",
    name = "default_404",
    body = {
        "project": PROJECT,
        "name": DEFAULT_404_BUCKET_NAME,
        "location": BUCKET_LOCATION,
        "uniform_bucket_level_access": True,
        "force_destroy": True,
    },
    attrs = ["id", "name", "url"],
)

# `google_compute_backend_bucket` cannot authenticate to a private GCS bucket;
# without this `allUsers` grant the LB would return 403 (not 404) for
# unmatched paths, contradicting the documented behavior. Requires the project
# to not enforce `storage.publicAccessPrevention`.
_DEFAULT_404_BUCKET_PUBLIC = resource(
    rtype = "google_storage_bucket_iam_member",
    name = "default_404_public",
    body = {
        "bucket": _DEFAULT_404_BUCKET.name,
        "role": "roles/storage.objectViewer",
        "member": "allUsers",
    },
    attrs = ["id", "etag"],
)

_DEFAULT_404_BACKEND_BUCKET = resource(
    rtype = "google_compute_backend_bucket",
    name = "default_404",
    body = {
        "project": PROJECT,
        "name": "{}-default-404".format(NAME),
        "bucket_name": _DEFAULT_404_BUCKET.name,
    },
    attrs = ["id", "name", "self_link"],
)

# --- Serverless NEGs + backend services --------------------------------------
# One NEG per (backend, region) pair, then one backend_service per backend
# that aggregates every NEG belonging to it. The URL map routes `paths` to
# the backend_service; the backend_service's NEGs do the regional fan-out
# via Google's geo-aware LB — closest healthy NEG wins.

_NEGS = {
    slug: resource(
        rtype = "google_compute_region_network_endpoint_group",
        name = slug,
        body = {
            "project": PROJECT,
            "name": "{}-{}-{}".format(NAME, entry["backend_key"], entry["region"]),
            "region": entry["region"],
            "network_endpoint_type": "SERVERLESS",
            "cloud_run": [{"service": entry["service_name"]}],
        },
        attrs = ["id", "name", "self_link"],
    )
    for slug, entry in _NEG_ENTRIES.items()
}

# Cloud CDN respecting upstream `Cache-Control`, shared by both origin
# kinds. This stack assumes nothing about cacheability per path: a Cloud Run
# origin emits the headers from its nginx conf, a bucket origin carries them
# as object metadata, and both are rendered from the same declared policy
# (`//devtools/build/react_component:cache.bzl`).
_CDN_POLICY = [{
    "cache_mode": "USE_ORIGIN_HEADERS",
    "negative_caching": True,
    # Provider requires one of cache_key_policy or
    # signed_url_cache_max_age_sec. We don't issue signed URLs, so 0 is a
    # no-op; keeps the schema happy.
    "signed_url_cache_max_age_sec": 0,
}]

_BACKEND_SERVICES = {
    backend_key: resource(
        rtype = "google_compute_backend_service",
        name = backend_key,
        body = {
            "project": PROJECT,
            "name": "{}-{}".format(NAME, backend_key),
            "load_balancing_scheme": "EXTERNAL_MANAGED",
            "protocol": "HTTPS",
            "timeout_sec": 30,
            "backend": [
                {
                    "group": _NEGS["{}_{}".format(backend_key, r.replace("-", "_"))].id,
                }
                for r in backend["regions"]
            ],
            "enable_cdn": True,
            "cdn_policy": _CDN_POLICY,
            "log_config": [{
                "enable": True,
                "sample_rate": 1.0,
            }],
        },
        attrs = ["id", "name", "self_link"],
    )
    for backend_key, backend in _CLOUDRUN_BACKENDS.items()
}

# --- Backend buckets ---------------------------------------------------------
# The static origins. A backend bucket has no NEG, no health check and no
# region list, because there is nothing running to find, check or place —
# which is exactly why a site served this way has no cold start.

_BACKEND_BUCKETS = {
    backend_key: resource(
        rtype = "google_compute_backend_bucket",
        name = backend_key,
        body = {
            "project": PROJECT,
            "name": "{}-{}".format(NAME, backend_key),
            "bucket_name": backend["bucket_name"],
            "enable_cdn": True,
            "cdn_policy": _CDN_POLICY,
            # Brotli or gzip at the edge, chosen from the request's
            # `Accept-Encoding`. A bucket cannot do this: it serves the bytes
            # it stores, and `bucket_push` stores them uncompressed. Storing
            # them compressed instead would mean a `Content-Encoding` stamped
            # on the object and served to every client whether or not it
            # asked — GCS does no negotiation — so the choice is edge
            # compression or none.
            #
            # This field is a sibling of `cdn_policy`, not part of it, which
            # is why it does not live in `_CDN_POLICY` alongside the
            # cache-mode settings the two origin kinds share.
            "compression_mode": "AUTOMATIC",
        },
        attrs = ["id", "name", "self_link"],
    )
    for backend_key, backend in _GCS_CDN_BACKENDS.items()
}

# Both kinds under one key space, so the URL map can route to a backend
# without caring which mechanism realises it.
_ORIGINS = dict(_BACKEND_SERVICES, **_BACKEND_BUCKETS)

# --- URL map (HTTPS) ---------------------------------------------------------
# One path matcher per host. Within a host, a backend that declares `paths`
# becomes a path rule; a backend that declares none owns the host's
# `default_service` — which is what an SPA needs, since it serves its own
# 404 page on any unrecognised path and can't be hung off a path prefix
# without teaching it a base path.

# Where an SPA's history-API fallback lives now that there is no nginx to
# hold a `try_files`. A bucket 404s on every path that is not an object it
# holds, so the URL map answers with the app shell — which is what lets the
# app's `*` route render its own not-found page.
#
# The status stays 404. There is no `override_response_code` here on
# purpose: a path the bucket has no object for is a path this site does not
# serve, and saying 200 about it is untrue. A 200 is what makes a soft 404 —
# caches store the page, crawlers index it, uptime checks call it healthy,
# and a missing chunk comes back as HTML that a module loader cannot use
# while every 404 metric reads zero.
#
# A *real* client-side route must therefore be a real object, so the bucket
# answers it without this policy ever running — see `react_static_layer`,
# which materialises one per declared route. A route whose values cannot be
# enumerated (a dynamic segment) needs a `path_rule` here instead; none
# exists yet.
def _spa_fallback(origin):
    return [{
        "error_response_rule": [{
            "match_response_codes": ["404"],
            "path": "/index.html",
        }],
        "error_service": origin.id,
    }]

def _path_matcher(name, host):
    on_host = _backends_on(host)
    owners = sorted([k for k, b in on_host.items() if not b.get("paths")])
    if len(owners) > 1:
        fail(
            ("host %r has %d backends claiming its whole path space (%s); " +
             "at most one may omit `paths`") % (host, len(owners), ", ".join(owners)),
        )

    matcher = {
        "name": name,
        # No owner → unmatched paths on this host fall to the 404 bucket.
        "default_service": (
            _ORIGINS[owners[0]].id if owners else _DEFAULT_404_BACKEND_BUCKET.id
        ),
    }

    # Only the host's owner gets the fallback, and only if its driver is
    # `gcs-cdn`. A Cloud Run origin answers its own unknown paths — the app
    # is running there and knows what it serves — and the 404 bucket's whole
    # job is to 404.
    if owners and BACKENDS[owners[0]]["driver"] == DRIVER_GCS_CDN:
        matcher["default_custom_error_response_policy"] = _spa_fallback(_ORIGINS[owners[0]])

    rules = [
        {
            "paths": b["paths"],
            "service": _ORIGINS[k].id,
        }
        for k, b in sorted(on_host.items())
        if b.get("paths")
    ]
    if rules:
        matcher["path_rule"] = rules
    return matcher

def _matcher_name(host):
    return "routes-" + _host_slug(host)

_URL_MAP_HTTPS = resource(
    rtype = "google_compute_url_map",
    name = "https",
    body = {
        "project": PROJECT,
        "name": "{}-lb".format(NAME),
        "default_service": _DEFAULT_404_BACKEND_BUCKET.id,
        "host_rule": [
            {
                "hosts": [host],
                "path_matcher": _matcher_name(host),
            }
            for host in HOSTS
        ],
        "path_matcher": [
            _path_matcher(_matcher_name(host), host)
            for host in HOSTS
        ],
    },
    attrs = ["id", "name", "self_link"],
)

# --- URL map (HTTP → HTTPS redirect) -----------------------------------------
_URL_MAP_HTTP_REDIRECT = resource(
    rtype = "google_compute_url_map",
    name = "http_redirect",
    body = {
        "project": PROJECT,
        "name": "{}-lb-http-redirect".format(NAME),
        "default_url_redirect": [{
            "https_redirect": True,
            "redirect_response_code": "MOVED_PERMANENTLY_DEFAULT",
            "strip_query": False,
        }],
    },
    attrs = ["id", "name"],
)

# --- Certificate Manager -----------------------------------------------------
# Preferred over the classic `google_compute_managed_ssl_certificate`: scales
# past 15 certs per target proxy, supports DNS-01 for wildcards, and lets one
# cert be shared across multiple LBs via cert maps. Free for the first 100
# certs per project.

_CERT_MAP = resource(
    rtype = "google_certificate_manager_certificate_map",
    name = "this",
    body = {
        "project": PROJECT,
        "name": "{}-lb-cert-map".format(NAME),
    },
    attrs = ["id", "name"],
)

# `DOMAIN`'s certificate predates multi-host support and is live, so it keeps
# the resource address and GCP name it was created under. Renaming either
# would destroy and recreate a working certificate, and the replacement is
# unusable until Google finishes issuing it. Every other host is named after
# itself. This is the only place the primary host is a special case.
def _cert_tf_name(host):
    return "this" if host == DOMAIN else _host_tf_name(host)

def _cert_gcp_name(host):
    if host == DOMAIN:
        return "{}-lb-cert".format(NAME)
    return "{}-lb-cert-{}".format(NAME, _host_slug(host))

# One managed certificate per host.
#
# Issuance is LB-authorized, so a certificate stays PROVISIONING until its
# host's A record resolves to `lb_ip` and reaches this LB directly. A proxying
# CDN in front of the record (Cloudflare's orange cloud, say) terminates TLS
# itself, so the validation request never lands here and the certificate sits
# PROVISIONING indefinitely.
_CERTS = {
    host: resource(
        rtype = "google_certificate_manager_certificate",
        name = _cert_tf_name(host),
        body = {
            "project": PROJECT,
            "name": _cert_gcp_name(host),
            "scope": "DEFAULT",
            "managed": [{"domains": [host]}],
        },
        attrs = ["id", "name"],
    )
    for host in HOSTS
}

# A map holds exactly one PRIMARY entry — the certificate served when SNI
# matches nothing else — so `DOMAIN` claims it and every other host selects by
# `hostname`. That asymmetry is the Certificate Manager API's, not ours.
_CERT_MAP_ENTRIES = [
    resource(
        rtype = "google_certificate_manager_certificate_map_entry",
        name = "primary" if host == DOMAIN else _host_tf_name(host),
        body = dict(
            {
                "project": PROJECT,
                "name": (
                    "{}-lb-cert-default".format(NAME) if host == DOMAIN else _cert_gcp_name(host)
                ),
                "map": _CERT_MAP.name,
                "certificates": [_CERTS[host].id],
            },
            **({"matcher": "PRIMARY"} if host == DOMAIN else {"hostname": host})
        ),
        attrs = ["id", "name"],
    )
    for host in HOSTS
]

# --- Frontend: HTTPS (443) ---------------------------------------------------
_TARGET_HTTPS_PROXY = resource(
    rtype = "google_compute_target_https_proxy",
    name = "this",
    body = {
        "project": PROJECT,
        "name": "{}-lb".format(NAME),
        "url_map": _URL_MAP_HTTPS.id,
        "certificate_map": "//certificatemanager.googleapis.com/{}".format(_CERT_MAP.id),
    },
    attrs = ["id", "name"],
)

_GLOBAL_ADDRESS = resource(
    rtype = "google_compute_global_address",
    name = "this",
    body = {
        "project": PROJECT,
        "name": "{}-lb".format(NAME),
    },
    attrs = ["id", "address", "name"],
)

_FORWARDING_RULE_HTTPS = resource(
    rtype = "google_compute_global_forwarding_rule",
    name = "https",
    body = {
        "project": PROJECT,
        "name": "{}-lb-https".format(NAME),
        "load_balancing_scheme": "EXTERNAL_MANAGED",
        "port_range": "443",
        "target": _TARGET_HTTPS_PROXY.id,
        "ip_address": _GLOBAL_ADDRESS.id,
    },
    attrs = ["id", "name"],
)

# --- Frontend: HTTP (80) → HTTPS redirect ------------------------------------
_TARGET_HTTP_PROXY_REDIRECT = resource(
    rtype = "google_compute_target_http_proxy",
    name = "redirect",
    body = {
        "project": PROJECT,
        "name": "{}-lb-http".format(NAME),
        "url_map": _URL_MAP_HTTP_REDIRECT.id,
    },
    attrs = ["id", "name"],
)

_FORWARDING_RULE_HTTP_REDIRECT = resource(
    rtype = "google_compute_global_forwarding_rule",
    name = "http_redirect",
    body = {
        "project": PROJECT,
        "name": "{}-lb-http".format(NAME),
        "load_balancing_scheme": "EXTERNAL_MANAGED",
        "port_range": "80",
        "target": _TARGET_HTTP_PROXY_REDIRECT.id,
        "ip_address": _GLOBAL_ADDRESS.id,
    },
    attrs = ["id", "name"],
)

# --- Outputs -----------------------------------------------------------------
_OUTPUTS = [
    output(
        "lb_ip",
        value = _GLOBAL_ADDRESS.address,
        description = "Anycast IP for the LB frontend. Create an A record for var.domain pointing at this address; managed cert issuance completes once DNS resolves.",
    ),
    output(
        "certificate_map_id",
        value = _CERT_MAP.id,
        description = "Certificate Manager cert map. Attach additional certs as extra `certificate_map_entry` resources outside this stack to serve more domains on the same LB.",
    ),
    output(
        "url_map_id",
        value = _URL_MAP_HTTPS.id,
        description = "HTTPS URL map. Add host_rule/path_matcher blocks here to route additional domains to the same backends.",
    ),
    output(
        "default_404_bucket",
        value = _DEFAULT_404_BUCKET.name,
        description = "Empty bucket that serves the 404 default. Drop a landing page in here (and adjust Cache-Control) if you'd rather a friendly page on unmatched paths.",
    ),
]

# Aggregated list of all docs that go into the tf_root.
LB_DOCS = (
    [_DEFAULT_404_BUCKET, _DEFAULT_404_BUCKET_PUBLIC, _DEFAULT_404_BACKEND_BUCKET] +
    list(_NEGS.values()) +
    list(_BACKEND_SERVICES.values()) +
    list(_BACKEND_BUCKETS.values()) +
    [_CERTS[host] for host in HOSTS] +
    _CERT_MAP_ENTRIES +
    [
        _URL_MAP_HTTPS,
        _URL_MAP_HTTP_REDIRECT,
        _CERT_MAP,
        _TARGET_HTTPS_PROXY,
        _GLOBAL_ADDRESS,
        _FORWARDING_RULE_HTTPS,
        _TARGET_HTTP_PROXY_REDIRECT,
        _FORWARDING_RULE_HTTP_REDIRECT,
    ] +
    _OUTPUTS
)
