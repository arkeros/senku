"Shared distroless distro metadata and platform mappings."

VERSIONS = [
    # (distro_key, codename, version_id) — distro_key matches the apt.install /
    # rpm.install name in MODULE.bazel; codename + version_id flow into
    # /etc/os-release. `version_id` must be parseable per os-release(5) — no
    # slashes, no spaces. We track Debian unstable (sid), so version_id is
    # "unstable": that's the value grype's debian distro normaliser maps to the
    # sid CVE feed (debian:sid is *not* recognised, debian:unstable is). An
    # earlier "13/sid" was both spec-non-compliant (slash) and silently broke
    # vuln scanning by parsing as neither debian:13 nor debian:unstable.
    #
    # For hummingbird, version_id is the Hummingbird snapshot revision (Unix
    # timestamp from the repomd.xml). grype's hummingbird provider routes on
    # ID alone, so VERSION_ID is informational only.
    ("debian", "sid", "unstable"),
    ("hummingbird", "hummingbird", "1778852516"),
    # Wolfi snapshot anchor: truncated APKINDEX sha256 from
    # //:wolfi.lock.json. grype routes wolfi by ID alone (same as
    # hummingbird), so VERSION_ID is informational.
    ("wolfi", "wolfi", "1d7d8c4c381af360"),
]

VARIANTS = {
    "arm": "v7",
    "arm64": "v8",
}

ARCHITECTURE_PLATFORMS = {
    "amd64": "//bazel/platforms:linux_amd64",
    "arm64": "//bazel/platforms:linux_arm64",
}

ALL_ARCHITECTURES = ["amd64", "arm64"]
ALL_DISTROS = ["debian", "hummingbird", "wolfi"]

# Senku arch (debian-style amd64/arm64) -> rpm arch (x86_64/aarch64), the
# subdir convention used by the @hummingbird module extension. Image BUILDs
# that compose rpm-shaped layers reach into `@hummingbird//<pkg>/<rpm_arch>`
# via this map. See ADR 0007 for why hummingbird keeps rpm-native arch names.
HUMMINGBIRD_ARCH_MAP = {
    "amd64": "x86_64",
    "arm64": "aarch64",
}

# Same shape for wolfi: rules_apk emits per-arch subdirs at @wolfi//<pkg>/<apk_arch>
# using apk-native arch names. Wolfi happens to use the same names as
# rpm-land (x86_64/aarch64), so this map is value-identical to the
# hummingbird one — keep separate constants so a future divergence
# (e.g. wolfi adding armv7) doesn't have to grow a conditional.
WOLFI_ARCH_MAP = {
    "amd64": "x86_64",
    "arm64": "aarch64",
}
