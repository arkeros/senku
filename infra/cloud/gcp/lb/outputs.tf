output "lb_ip" {
  value       = google_compute_global_address.this.address
  description = "Anycast IP for the LB frontend. Create an A record for var.domain pointing at this address; managed cert issuance completes once DNS resolves."
}

output "certificate_map_id" {
  value       = google_certificate_manager_certificate_map.this.id
  description = "Certificate Manager cert map. Attach additional certs as extra `certificate_map_entry` resources outside this stack to serve more domains on the same LB."
}

output "url_map_id" {
  value       = google_compute_url_map.https.id
  description = "HTTPS URL map. Add host_rule/path_matcher blocks here to route additional domains to the same backends."
}

output "default_404_bucket" {
  value       = google_storage_bucket.default_404.name
  description = "Empty bucket that serves the 404 default. Drop a landing page in here (and adjust Cache-Control) if you'd rather a friendly page on unmatched paths."
}
