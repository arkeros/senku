provider "google" {
  project = var.project_id
}

locals {
  prefix = var.name
}

# --- Backends sourced from service-root state --------------------------------
# Each service root (e.g. examples/hello, oci/cmd/registry) exposes an
# `lb_backends` output shaped like
#   map(backend_key => object({
#     service_name = string                # Cloud Run service name (same in every region)
#     regions      = list(string)          # GCP regions the service is deployed to
#     paths        = list(string)          # URL-map paths routed to this backend
#   }))
# We pull those outputs via `terraform_remote_state` and merge them into one
# map. One backend can span multiple regions — each region becomes its own
# Serverless NEG attached to a single backend service, so Google's global LB
# does the geo-steering. Collisions between service roots on the same backend
# key are rejected at plan time by the check block.

data "terraform_remote_state" "backends" {
  for_each = var.backend_states

  backend = "gcs"
  config = {
    bucket = "senku-prod-terraform-state"
    prefix = each.value
  }
}

locals {
  backends = merge([
    for _, s in data.terraform_remote_state.backends : s.outputs.lb_backends
  ]...)

  # Flattened (backend_key, region) pairs. Used to `for_each` NEGs, where the
  # resource key is a stable `"<backend>-<region>"` slug — both backend-level
  # and region-level fan-out in a single resource block.
  neg_entries = merge([
    for backend_key, backend in local.backends : {
      for region in backend.regions :
      "${backend_key}-${region}" => {
        backend_key  = backend_key
        region       = region
        service_name = backend.service_name
      }
    }
  ]...)
}

check "backend_keys_unique" {
  assert {
    condition = length(local.backends) == sum([
      for _, s in data.terraform_remote_state.backends : length(s.outputs.lb_backends)
    ])
    error_message = "Two or more service roots produced overlapping backend keys in their `lb_backends` outputs; rename to disambiguate."
  }
}

check "backend_paths_non_empty" {
  assert {
    condition     = alltrue([for _, v in local.backends : length(v.paths) > 0])
    error_message = "Every backend must declare at least one path (use [\"/*\"] for catch-all)."
  }
}

check "backend_regions_non_empty" {
  assert {
    condition     = alltrue([for _, v in local.backends : length(v.regions) > 0])
    error_message = "Every backend must declare at least one region in its `regions` map."
  }
}

# --- 404 default --------------------------------------------------------------
# Empty GCS bucket fronted by a backend bucket. Used as the URL map's
# `default_service` so unmatched host+path requests return 404 (GCS serves
# 404 for any key that doesn't exist in the bucket). Avoids the trap where
# unmatched traffic silently lands on whichever backend was listed first.

resource "google_storage_bucket" "default_404" {
  project                     = var.project_id
  name                        = "${var.project_id}-${local.prefix}-lb-404"
  location                    = var.bucket_location
  uniform_bucket_level_access = true
  force_destroy               = true
}

resource "google_compute_backend_bucket" "default_404" {
  project     = var.project_id
  name        = "${local.prefix}-default-404"
  bucket_name = google_storage_bucket.default_404.name
}

# --- Serverless NEGs + backend services ---------------------------------------
# One NEG per (backend, region) pair, then one backend_service per backend
# that aggregates every NEG belonging to it. The URL map routes `paths` to
# the backend_service; the backend_service's NEGs do the regional fan-out
# via Google's geo-aware LB — closest healthy NEG wins.

resource "google_compute_region_network_endpoint_group" "backend" {
  for_each = local.neg_entries

  project               = var.project_id
  name                  = "${local.prefix}-${each.key}"
  region                = each.value.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.service_name
  }
}

resource "google_compute_backend_service" "backend" {
  for_each = local.backends

  project = var.project_id
  name    = "${local.prefix}-${each.key}"

  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  timeout_sec           = 30

  dynamic "backend" {
    for_each = toset(each.value.regions)
    content {
      group = google_compute_region_network_endpoint_group.backend["${each.key}-${backend.value}"].id
    }
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# --- URL map (HTTPS) ----------------------------------------------------------

resource "google_compute_url_map" "https" {
  project = var.project_id
  name    = "${local.prefix}-lb"

  default_service = google_compute_backend_bucket.default_404.id

  host_rule {
    hosts        = [var.domain]
    path_matcher = "routes"
  }

  path_matcher {
    name            = "routes"
    default_service = google_compute_backend_bucket.default_404.id

    dynamic "path_rule" {
      for_each = local.backends
      content {
        paths   = path_rule.value.paths
        service = google_compute_backend_service.backend[path_rule.key].id
      }
    }
  }
}

# --- URL map (HTTP → HTTPS redirect) ------------------------------------------

resource "google_compute_url_map" "http_redirect" {
  project = var.project_id
  name    = "${local.prefix}-lb-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

# --- Certificate Manager ------------------------------------------------------
# Preferred over the classic `google_compute_managed_ssl_certificate`:
# scales past 15 certs per target proxy, supports DNS-01 for wildcards, and
# lets one cert be shared across multiple LBs via cert maps. Free for the
# first 100 certs per project.

resource "google_certificate_manager_certificate" "this" {
  project = var.project_id
  name    = "${local.prefix}-lb-cert"
  scope   = "DEFAULT"

  managed {
    domains = [var.domain]
  }
}

resource "google_certificate_manager_certificate_map" "this" {
  project = var.project_id
  name    = "${local.prefix}-lb-cert-map"
}

resource "google_certificate_manager_certificate_map_entry" "primary" {
  project      = var.project_id
  name         = "${local.prefix}-lb-cert-default"
  map          = google_certificate_manager_certificate_map.this.name
  certificates = [google_certificate_manager_certificate.this.id]
  matcher      = "PRIMARY"
}

# --- Frontend: HTTPS (443) ----------------------------------------------------

resource "google_compute_target_https_proxy" "this" {
  project         = var.project_id
  name            = "${local.prefix}-lb"
  url_map         = google_compute_url_map.https.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.this.id}"
}

resource "google_compute_global_address" "this" {
  project = var.project_id
  name    = "${local.prefix}-lb"
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${local.prefix}-lb-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.this.id
  ip_address            = google_compute_global_address.this.id
}

# --- Frontend: HTTP (80) → HTTPS redirect -------------------------------------

resource "google_compute_target_http_proxy" "redirect" {
  project = var.project_id
  name    = "${local.prefix}-lb-http"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_redirect" {
  project               = var.project_id
  name                  = "${local.prefix}-lb-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.this.id
}
