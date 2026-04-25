output "lb_backends" {
  value = {
    v1 = {
      service_name = module.hello_v1.service_name
      regions      = [var.region]
      paths        = ["/v1/*"]
    }
    v2 = {
      service_name = module.hello_v2.service_name
      regions      = [var.region]
      paths        = ["/v2/*"]
    }
  }
  description = "LB backends exposed for the sibling LB stack to read via `terraform_remote_state`. Shape: each backend carries a single `service_name`, a list of GCP `regions` it runs in, and the URL-map `paths` that route to it. Sample services here are single-region; real services fan out by adding regions."
}

output "service_account_emails" {
  value = {
    v1 = module.hello_v1.service_account_email
    v2 = module.hello_v2.service_account_email
  }
  description = "Runtime GSAs for the sample services. Grant downstream IAM (Secret Manager, Firestore, etc.) to these identities."
}
