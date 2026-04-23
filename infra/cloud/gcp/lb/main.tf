provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = var.name
}

# --- Sample Cloud Run services ------------------------------------------------
# These are placeholder workloads demonstrating the LB routing shape:
# `/v1/*` → hello_v1, `/v2/*` → hello_v2, both on the same domain.
# Replace with real services; the LB wiring below stays structurally the same.

module "hello_v1" {
  source = "../../../../devtools/bifrost/terraform/modules/service_cloudrun"

  name       = "hello-v1"
  project_id = var.project_id
  region     = var.region

  image     = "gcr.io/google-samples/hello-app@sha256:3f87c2db2eab75bf8e5a3a48d6be1f73bb2a0c1e7e34e08b3e7b7e3b7e3b7e3b"
  resources = { cpu = 0.5, memory = 512 }

  scaling = {
    min = 0
    max = 3
  }

  # Public invoker + LB-only ingress is the canonical "behind an external LB"
  # recipe: no auth on the LB hop, but direct *.run.app calls are blocked.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  public  = true
}

module "hello_v2" {
  source = "../../../../devtools/bifrost/terraform/modules/service_cloudrun"

  name       = "hello-v2"
  project_id = var.project_id
  region     = var.region

  image     = "gcr.io/google-samples/hello-app@sha256:3f87c2db2eab75bf8e5a3a48d6be1f73bb2a0c1e7e34e08b3e7b7e3b7e3b7e3b"
  resources = { cpu = 0.5, memory = 512 }

  scaling = {
    min = 0
    max = 3
  }

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  public  = true
}

# --- Serverless NEGs ----------------------------------------------------------
# One NEG per (service, region). Adding a second region to a service = add a
# second NEG here and a second `backend` block in the matching backend service.

resource "google_compute_region_network_endpoint_group" "hello_v1" {
  project               = var.project_id
  name                  = "${local.prefix}-hello-v1"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = module.hello_v1.service_name
  }
}

resource "google_compute_region_network_endpoint_group" "hello_v2" {
  project               = var.project_id
  name                  = "${local.prefix}-hello-v2"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = module.hello_v2.service_name
  }
}

# --- Backend services ---------------------------------------------------------
# One backend service per logical route. Keeping the split per-service (not
# per-route) lets us add NEGs in new regions without restructuring the URL map.

resource "google_compute_backend_service" "hello_v1" {
  project = var.project_id
  name    = "${local.prefix}-hello-v1"

  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.hello_v1.id
  }
}

resource "google_compute_backend_service" "hello_v2" {
  project = var.project_id
  name    = "${local.prefix}-hello-v2"

  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.hello_v2.id
  }
}

# --- URL map ------------------------------------------------------------------

resource "google_compute_url_map" "this" {
  project = var.project_id
  name    = "${local.prefix}-lb"

  default_service = google_compute_backend_service.hello_v1.id

  host_rule {
    hosts        = [var.domain]
    path_matcher = "api"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.hello_v1.id

    path_rule {
      paths   = ["/v1/*"]
      service = google_compute_backend_service.hello_v1.id
    }

    path_rule {
      paths   = ["/v2/*"]
      service = google_compute_backend_service.hello_v2.id
    }
  }
}

# --- TLS + frontend -----------------------------------------------------------

resource "google_compute_managed_ssl_certificate" "this" {
  project = var.project_id
  name    = "${local.prefix}-lb-cert"

  managed {
    domains = [var.domain]
  }
}

resource "google_compute_target_https_proxy" "this" {
  project          = var.project_id
  name             = "${local.prefix}-lb"
  url_map          = google_compute_url_map.this.id
  ssl_certificates = [google_compute_managed_ssl_certificate.this.id]
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
