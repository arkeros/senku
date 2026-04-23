terraform {
  required_version = ">= 1.14.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # State stored as a Secret in a Kubernetes cluster.
  # Prerequisites (bootstrap order):
  #   1. The cluster must already exist — creating it is not in this stack.
  #   2. `kubectl` must be authenticated to that cluster at plan/apply time.
  #   3. The target namespace must exist and be writable.
  #
  # Fill remaining fields via `-backend-config=...` at init time so the same
  # stack can be reused across environments without editing this file:
  #   terraform init \
  #     -backend-config="secret_suffix=prod" \
  #     -backend-config="namespace=terraform-state" \
  #     -backend-config="config_path=~/.kube/config" \
  #     -backend-config="config_context=senku-prod"
  backend "kubernetes" {}
}
