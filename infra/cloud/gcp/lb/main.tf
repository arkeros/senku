provider "google" {
  project = var.project_id
}

locals {
  prefix = var.name
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

# --- Serverless NEG + backend service per registered backend ------------------
# One (NEG, backend_service) pair per entry in var.backends. Adding a region
# to a backend = add another NEG in that region and an extra `backend` block
# in the matching backend_service — no URL-map restructuring.

resource "google_compute_region_network_endpoint_group" "backend" {
  for_each = var.backends

  project               = var.project_id
  name                  = "${local.prefix}-${each.key}"
  region                = each.value.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.service_name
  }
}

resource "google_compute_backend_service" "backend" {
  for_each = var.backends

  project = var.project_id
  name    = "${local.prefix}-${each.key}"

  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  timeout_sec           = 30

  backend {
    group = google_compute_region_network_endpoint_group.backend[each.key].id
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
      for_each = var.backends
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
