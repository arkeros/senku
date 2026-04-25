variable "project_id" {
  type        = string
  description = "GCP project that owns the LB and the Cloud Run services it fronts."
}

variable "name" {
  type        = string
  default     = "senku"
  description = "Prefix for LB resource names (backend services, URL maps, cert, cert map, forwarding rules, global IP, 404 bucket)."
}

variable "domain" {
  type        = string
  description = "Fully-qualified domain served by this LB. A Certificate Manager cert is provisioned for it; create an A record pointing at the `lb_ip` output so LB-authorized issuance can complete."
}

variable "backend_states" {
  type        = map(string)
  description = "Map of friendly service-root key → state prefix (which by convention equals the root's path in the repo). Every referenced root must live in the same state bucket as this root (`senku-prod-terraform-state`) and expose an `lb_backends` output shaped like `map(object({ region, service_name, paths }))`; the LB merges them into a single set of backends. Example: `{ hello = \"infra/cloud/gcp/lb/examples/hello\" }`."
  default     = {}
}

variable "bucket_location" {
  type        = string
  default     = "EU"
  description = "Location for the empty bucket that serves the URL map's 404 default. Multi-region (\"EU\", \"US\", \"ASIA\") is cheapest per GB and fine since the bucket is essentially never read."
}
