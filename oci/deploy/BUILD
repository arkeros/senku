load("@kustomize.bzl", "kustomize")
load("//bifrost:bifrost.bzl", "bifrost_service")
load("//oci:config.bzl", "OCI_REGISTRY", "OCI_REPOSITORY_PREFIX")

bifrost_service(
    name = "registry",
    args = [
        "--upstream=ghcr.io",
        "--repository-prefix=arkeros/senku",
    ],
    autoscaling = {
        "min": 0,
        "max": 3,
    },
    checked_in = {
        "terraform": "terraform/registry.generated.tf",
    },
    gcp = {
        "projectId": "senku-prod",
        "cloudRun": {
            "region": "europe-west3",
            "ingress": "all",
        },
    },
    image = "registry",
    kubernetes = {},
    port = 8080,
    probes = {
        "startupPath": "/v2/",
        "livenessPath": "/v2/",
    },
    resources = {
        "requests": {
            "cpu": "250m",
            "memory": "256Mi",
        },
        "limits": {
            "cpu": "1000m",
            "memory": "256Mi",
        },
    },
    visibility = ["//visibility:public"],
)

kustomize(
    name = "k8s",
    srcs = [
        "kustomization.yaml",
        ":registry_cloudrun",
    ],
    images = {
        "registry": "//oci/cmd/registry:image_nonroot_amd64",
    },
    registry = OCI_REGISTRY,
    repository_prefix = OCI_REPOSITORY_PREFIX,
    visibility = ["//visibility:public"],
)
