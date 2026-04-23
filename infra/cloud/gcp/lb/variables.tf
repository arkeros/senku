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

variable "backends" {
  type = map(object({
    region       = string
    service_name = string
    paths        = list(string)
  }))
  description = "Map of backend key → Cloud Run service coordinates and URL-map path rules. Each entry becomes one serverless NEG + one backend service; the URL map routes `paths` to it. Unmatched requests fall through to a 404 (backed by an empty storage bucket)."
  validation {
    condition     = alltrue([for k, v in var.backends : length(v.paths) > 0])
    error_message = "Every backend entry must declare at least one path (use [\"/*\"] if you want to catch-all)."
  }
}

variable "bucket_location" {
  type        = string
  default     = "EU"
  description = "Location for the empty bucket that serves the URL map's 404 default. Multi-region (\"EU\", \"US\", \"ASIA\") is cheapest per GB and fine since the bucket is essentially never read."
}
