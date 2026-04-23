variable "project_id" {
  type        = string
  description = "GCP project that owns the LB and the Cloud Run services it fronts."
}

variable "region" {
  type        = string
  default     = "europe-west1"
  description = "Default Cloud Run region for the sample services. Multi-region fan-out: duplicate the service modules per region and add one google_compute_region_network_endpoint_group per region to the backend service's backend blocks."
}

variable "name" {
  type        = string
  default     = "senku"
  description = "Prefix used for LB resource names (backend services, URL map, cert, forwarding rule, global IP)."
}

variable "domain" {
  type        = string
  description = "Fully-qualified domain served by this LB. A managed SSL cert is provisioned for it; create an A record pointing at the `lb_ip` output before the cert can finish provisioning."
}
