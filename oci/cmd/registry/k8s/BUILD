load("@kustomize.bzl", "kustomize")
load("//oci:config.bzl", "OCI_REGISTRY", "OCI_REPOSITORY_PREFIX")

kustomize(
    name = "k8s",
    srcs = glob(["*.yaml"]),
    images = {
        "registry": "//oci/cmd/registry:image_nonroot_amd64",
    },
    manifest_registry = OCI_REGISTRY,
    registry = OCI_REGISTRY,
    repository_prefix = OCI_REPOSITORY_PREFIX,
    visibility = ["//visibility:public"],
)
