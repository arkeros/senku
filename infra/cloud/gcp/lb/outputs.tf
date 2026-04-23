output "lb_ip" {
  value       = google_compute_global_address.this.address
  description = "Anycast IP for the LB frontend. Create an A record for var.domain pointing at this address; managed cert provisioning will not complete until DNS resolves."
}

output "ssl_certificate_id" {
  value       = google_compute_managed_ssl_certificate.this.id
  description = "Managed SSL cert resource ID. Check provisioning status with `gcloud compute ssl-certificates describe`."
}

output "url_map_id" {
  value       = google_compute_url_map.this.id
  description = "URL map resource ID. Handy for wiring additional certs or sibling target proxies (e.g. an HTTP→HTTPS redirect)."
}
