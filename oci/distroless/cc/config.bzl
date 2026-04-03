CC_DISTROS = ["debian13"]
CC_ARCHITECTURES = {
    # "debian12": ["amd64", "arm64", "arm", "s390x", "ppc64le"],
    "debian13": ["amd64", "arm64"],
}

CC_PACKAGES = {
    "debian12": [
        "libc6",
        "libssl3",
    ],
    "debian13": [
        "libc6",
        "libssl3t64",
    ],
}
