"""Identity, derived strings, and resource declarations for the global LB.

The HTTP(S) load balancer fronts every Cloud Run service that contributes a
backend (registry today, others later). Each contributing service exposes an
`LB_BACKEND` constant from its own `defs.bzl`; this root aggregates them.
That replaces the previous `terraform_remote_state` data sources — same
content, no runtime indirection.
"""

load("//devtools/build/tools/tf:defs.bzl", "resource")
load("//oci/cmd/registry:defs.bzl", _REGISTRY_LB_BACKEND = "LB_BACKEND")

PROJECT = "senku-prod"

# Prefix for LB resource names (backend services, URL maps, cert, cert map,
# forwarding rules, global IP, 404 bucket). Distinct from any specific
# service so the LB is identifiable on its own.
NAME = "senku"

# Fully-qualified domain served by this LB. Create an A record pointing at
# the `lb_ip` output so the managed cert's LB-authorized issuance can
# complete.
DOMAIN = "distroless.io"

# Multi-region location for the empty bucket that serves the URL map's 404
# default. Cheapest per GB and effectively never read.
BUCKET_LOCATION = "EU"

# --- backends -----------------------------------------------------------------
# Map backend_key → backend descriptor. New services contributing to this LB
# add an entry here and an `LB_BACKEND` constant in their root.

BACKENDS = {
    "registry": _REGISTRY_LB_BACKEND,
}

# Flattened {slug → entry} for one NEG per (backend, region). The slug is a
# valid Terraform identifier (no hyphens) so each NEG gets a non-bracketed
# resource address.
_NEG_ENTRIES = {
    "{}_{}".format(backend_key, region.replace("-", "_")): {
        "backend_key": backend_key,
        "region": region,
        "service_name": backend["service_name"],
    }
    for backend_key, backend in BACKENDS.items()
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
            # Cloud CDN respecting upstream `Cache-Control`. The backends
            # behind us (Cloud Run services) are responsible for emitting
            # accurate headers — this stack assumes nothing about
            # cacheability per path.
            "enable_cdn": True,
            "cdn_policy": [{
                "cache_mode": "USE_ORIGIN_HEADERS",
                "negative_caching": True,
                # Provider requires one of cache_key_policy or
                # signed_url_cache_max_age_sec. We don't issue signed URLs,
                # so 0 is a no-op; keeps the schema happy.
                "signed_url_cache_max_age_sec": 0,
            }],
            "log_config": [{
                "enable": True,
                "sample_rate": 1.0,
            }],
        },
        attrs = ["id", "name", "self_link"],
    )
    for backend_key, backend in BACKENDS.items()
}

# --- URL map (HTTPS) ---------------------------------------------------------
_URL_MAP_HTTPS = resource(
    rtype = "google_compute_url_map",
    name = "https",
    body = {
        "project": PROJECT,
        "name": "{}-lb".format(NAME),
        "default_service": _DEFAULT_404_BACKEND_BUCKET.id,
        "host_rule": [{
            "hosts": [DOMAIN],
            "path_matcher": "routes",
        }],
        "path_matcher": [{
            "name": "routes",
            "default_service": _DEFAULT_404_BACKEND_BUCKET.id,
            "path_rule": [
                {
                    "paths": backend["paths"],
                    "service": _BACKEND_SERVICES[backend_key].id,
                }
                for backend_key, backend in BACKENDS.items()
            ],
        }],
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

_CERT = resource(
    rtype = "google_certificate_manager_certificate",
    name = "this",
    body = {
        "project": PROJECT,
        "name": "{}-lb-cert".format(NAME),
        "scope": "DEFAULT",
        "managed": [{"domains": [DOMAIN]}],
    },
    attrs = ["id", "name"],
)

_CERT_MAP = resource(
    rtype = "google_certificate_manager_certificate_map",
    name = "this",
    body = {
        "project": PROJECT,
        "name": "{}-lb-cert-map".format(NAME),
    },
    attrs = ["id", "name"],
)

_CERT_MAP_ENTRY = resource(
    rtype = "google_certificate_manager_certificate_map_entry",
    name = "primary",
    body = {
        "project": PROJECT,
        "name": "{}-lb-cert-default".format(NAME),
        "map": _CERT_MAP.name,
        "certificates": [_CERT.id],
        "matcher": "PRIMARY",
    },
    attrs = ["id", "name"],
)

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
    {"output": {"lb_ip": {
        "value": _GLOBAL_ADDRESS.address,
        "description": "Anycast IP for the LB frontend. Create an A record for var.domain pointing at this address; managed cert issuance completes once DNS resolves.",
    }}},
    {"output": {"certificate_map_id": {
        "value": _CERT_MAP.id,
        "description": "Certificate Manager cert map. Attach additional certs as extra `certificate_map_entry` resources outside this stack to serve more domains on the same LB.",
    }}},
    {"output": {"url_map_id": {
        "value": _URL_MAP_HTTPS.id,
        "description": "HTTPS URL map. Add host_rule/path_matcher blocks here to route additional domains to the same backends.",
    }}},
    {"output": {"default_404_bucket": {
        "value": _DEFAULT_404_BUCKET.name,
        "description": "Empty bucket that serves the 404 default. Drop a landing page in here (and adjust Cache-Control) if you'd rather a friendly page on unmatched paths.",
    }}},
]

# Aggregated list of all docs that go into the tf_root.
LB_DOCS = (
    [_DEFAULT_404_BUCKET, _DEFAULT_404_BACKEND_BUCKET] +
    list(_NEGS.values()) +
    list(_BACKEND_SERVICES.values()) +
    [
        _URL_MAP_HTTPS,
        _URL_MAP_HTTP_REDIRECT,
        _CERT,
        _CERT_MAP,
        _CERT_MAP_ENTRY,
        _TARGET_HTTPS_PROXY,
        _GLOBAL_ADDRESS,
        _FORWARDING_RULE_HTTPS,
        _TARGET_HTTP_PROXY_REDIRECT,
        _FORWARDING_RULE_HTTP_REDIRECT,
    ] +
    _OUTPUTS
)
