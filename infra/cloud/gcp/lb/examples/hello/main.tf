provider "google" {
  project = var.project_id
  region  = var.region
}

# Canonical "behind an external LB" recipe for each service:
# `public = true` so the LB can invoke without injecting identity,
# `ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` so direct *.run.app
# traffic is rejected and the LB is the only ingress path.

module "hello_v1" {
  source = "../../../../../../devtools/bifrost/terraform/modules/service_cloudrun"

  name       = "hello-v1"
  project_id = var.project_id
  region     = var.region

  image     = var.image
  resources = { cpu = 0.5, memory = 512 }

  scaling = {
    min = 0
    max = 3
  }

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  public  = true
}

module "hello_v2" {
  source = "../../../../../../devtools/bifrost/terraform/modules/service_cloudrun"

  name       = "hello-v2"
  project_id = var.project_id
  region     = var.region

  image     = var.image
  resources = { cpu = 0.5, memory = 512 }

  scaling = {
    min = 0
    max = 3
  }

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  public  = true
}
