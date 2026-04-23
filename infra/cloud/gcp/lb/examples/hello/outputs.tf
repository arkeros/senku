output "lb_backends" {
  value = {
    v1 = {
      region       = var.region
      service_name = module.hello_v1.service_name
      paths        = ["/v1/*"]
    }
    v2 = {
      region       = var.region
      service_name = module.hello_v2.service_name
      paths        = ["/v2/*"]
    }
  }
  description = "Shaped exactly like `var.backends` in the sibling LB stack. Feed it in via: `terraform output -json lb_backends > ../../backends.auto.tfvars.json`."
}

output "service_account_emails" {
  value = {
    v1 = module.hello_v1.service_account_email
    v2 = module.hello_v2.service_account_email
  }
  description = "Runtime GSAs for the sample services. Grant downstream IAM (Secret Manager, Firestore, etc.) to these identities."
}
