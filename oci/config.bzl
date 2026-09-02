# rules_img requires registry and repository as separate values
OCI_REGISTRY = "ghcr.io"
OCI_REPOSITORY_PREFIX = "arkeros/senku"

# GAR destination is owned by `//infra/cloud/gcp/gar:defs.bzl` (the root that
# provisions it). Load `GAR_REGISTRY` / `GAR_REPOSITORY_PREFIX` from there.

GO_DISTROS = ["debian"]
GO_ARCHITECTURES = {
    "debian": ["amd64", "arm64"],
}

PYTHON_DISTROS = ["debian"]
PYTHON_ARCHITECTURES = {
    "debian": ["amd64", "arm64"],
}

PYTHON_PACKAGES = [
    "libbz2-1.0",
    # "libdb5.3",
    "libexpat1",
    "liblzma5",
    "libsqlite3-0",
    "libuuid1",
    "libncursesw6",
    "libtinfo6",
    "zlib1g",
    "libcom-err2",
    "libcrypt1",
    "libgssapi-krb5-2",
    "libk5crypto3",
    "libkeyutils1",
    "libkrb5-3",
    "libkrb5support0",
    "libnsl2",
    # "libreadline8",
    # "libtirpc3",
    "libffi8",
]

NODEJS_DISTROS = ["debian"]
NODEJS_ARCHITECTURES = {
    "debian": ["amd64", "arm64"],
}

# Architectures the frontend images are published for, and the platform each
# one builds under. Absorbed from the old //oci/distroless tree, which built
# the base images senku now pulls.
ALL_ARCHITECTURES = ["amd64", "arm64"]

ARCHITECTURE_PLATFORMS = {
    "amd64": "//bazel/platforms:linux_amd64",
    "arm64": "//bazel/platforms:linux_arm64",
}

# Owner of the served statics. Must match the UID the nginx base runs as; it
# is part of that image's contract, not a choice made here.
NONROOT = 65532
