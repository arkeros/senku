"""Resolve-Secrets version definitions with filenames and checksums.

Binaries are published to GitHub Releases at:

    https://github.com/arkeros/senku/releases/download/resolve-secrets/v{}/{}

Format: "VERSION-PLATFORM": (filename, sha256)
Platforms: darwin_amd64, darwin_arm64, linux_amd64, linux_arm64

Regenerate with: bazel run //bazel/cmd/knife -- prebuilts update --tool resolve-secrets
"""

DEFAULT_VERSION = "2026.16.32"

RESOLVE_SECRETS_VERSIONS = {
    "2026.15.71-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "1e8e6f234e18b0dce5c025a27d1ed7fc0b135c01ed639e6ac15a3b0f3bac191b",
    ),
    "2026.15.71-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "b252d57ec0523184a939d29341dcbe5dae4743e155635123053ea9452ad0d4c6",
    ),
    "2026.15.71-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "121ece7588a6c0083e891320c3335dcf5834edb60800110e3775647713bc23fd",
    ),
    "2026.15.71-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "14ef494851b039656f2ad5157e577cc58e2c89785287b10c8f4b8d18375adacc",
    ),
    "2026.15.76-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "e99eeb20230aa2cde60452201a2d279769cdb2f4740e363c5333e48396a68452",
    ),
    "2026.15.76-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "6cfec0d3f12d7d1009b4247c51e528362e633ba69972aa25c815f6d412903430",
    ),
    "2026.15.76-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "fb27bd42dd704461ce1c6c8a3b80237aff367b664c085dc1f8be40e72f88fb08",
    ),
    "2026.15.76-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "905bd882d2b547df43cb57e4fc795243c40a1058cb9a02819572a4586a914b93",
    ),
    "2026.15.77-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "7c77bd02a1a0a0bc9a95c50aef41f7d208c2048fc49f5163097caeef600c09fe",
    ),
    "2026.15.77-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "01fa233fb5cd858a8fd8c90d23e416aa457071da5804e0a6288e57106b702cd9",
    ),
    "2026.15.77-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "f426af87bfe3fefed9ff3ae7d20a3bf061811f360662b558be717462e89dcf27",
    ),
    "2026.15.77-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "d191524909dffa604281fadb7077a0a71fe363b3c59e19d4b82ce54a782e4d0b",
    ),
    "2026.16.6-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "1c63e5740a3ee31ab57b9a8548fac11b9532447bcdef1a5f5e59d38db27bd030",
    ),
    "2026.16.6-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "ba8b8324c606b2054a18772a251ba9293def51463628f09f57f31484936ade1c",
    ),
    "2026.16.6-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "ca5e0fda6965ea0990ee28d5112bb1a1a8fdc7049e9b676844dfb73f4e3c3e68",
    ),
    "2026.16.6-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "52daed60e0d0b0c3a8a222ce5ec8129601d4976ac3727ecb05e79af0133d98c5",
    ),
    "2026.16.18-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "386b7e2222aad9a89fa93ee9494800844a17dbd0f0af562d96648428c06ea663",
    ),
    "2026.16.18-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "42cf050e272e9fff9b6f308ef3817f70d91af78449852a780862435b12955f36",
    ),
    "2026.16.18-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "f5a881805035d4273b8c9eabddcc774547b4e91708ccda5b8f86431c2a152e8c",
    ),
    "2026.16.18-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "d7209ec9f31b82e7f8ac7cd31876e445a1024e1f627849d692f5398a37952583",
    ),
    "2026.16.21-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "bfeb7b5b2c28deb80e90ddf864e98916dc70dc5ace4f032d2882e5e1d5a44db8",
    ),
    "2026.16.21-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "ea51a502dbe89fa10740b7fae84da4c7e7984e02a99bc1421e91e407b325eed5",
    ),
    "2026.16.21-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "96d8750ab5e33072d3297150d5be0f10dab3c3ff7a71fddfbcb66723b6107460",
    ),
    "2026.16.21-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "99a7137623170ef3b299b0bef9942d0b8858d96f08f0f8d43d7e31b9d2a15a96",
    ),
    "2026.16.24-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "0e1473fb33b2ed03347a9a6c1139f791df3652d117c74c2bf8a95328661a3f5a",
    ),
    "2026.16.24-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "6b99fb38f1ff3c832d28812120b9775b0668dac419c894da4fcf2181596ac386",
    ),
    "2026.16.24-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "e6f3ced3bedd5378b514c233da7e65203474f884f5e8d0cd5e7b8ffa275336be",
    ),
    "2026.16.24-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "a89a847b5892c2010ef2e80140db6ba9f261012981ad5c97a25f6f74c9835890",
    ),
    "2026.16.32-darwin_amd64": (
        "resolve-secrets-darwin-amd64",
        "efc9d27fcaf0b2265377836398fd82f90dcc95765214d8c471b039ea4fa31f7e",
    ),
    "2026.16.32-darwin_arm64": (
        "resolve-secrets-darwin-arm64",
        "632d06ae0b67a677d3e5a40104e2265e958fa29e45acd062e5f9cb03e3fee3b9",
    ),
    "2026.16.32-linux_amd64": (
        "resolve-secrets-linux-amd64",
        "14934d928d6d205d8ccd1b10f136e5eb143a492d90d4c254e3a25b7e63b23e0e",
    ),
    "2026.16.32-linux_arm64": (
        "resolve-secrets-linux-arm64",
        "caa29993f7b03de5118925c70b32fbf8d6c639954ad30e8be633dc21ae9a9708",
    ),
}

def get_resolve_secrets_url(version, filename):
    """Returns the download URL for a resolve-secrets release."""
    return "https://github.com/arkeros/senku/releases/download/resolve-secrets/v{}/{}".format(version, filename)
