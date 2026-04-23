variable "project_id" {
  type        = string
  description = "GCP project. Must match the project_id you pass to the sibling LB stack."
}

variable "region" {
  type        = string
  default     = "europe-west1"
  description = "Region for both sample services. Multi-region: instantiate additional modules with different regions and extend the lb_backends output accordingly."
}

variable "image" {
  type        = string
  default     = "gcr.io/google-samples/hello-app@sha256:3f87c2db2eab75bf8e5a3a48d6be1f73bb2a0c1e7e34e08b3e7b7e3b7e3b7e3b"
  description = "Digest-pinned image for both hello services. The default is a well-known placeholder and will not pull; swap for a real digest before apply."
}
