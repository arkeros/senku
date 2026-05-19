"""Providers carried by rules_apk targets.

Shape mirrors @rules_rpm's RpmHeaderInfo / TransitiveRpmHeaderInfo so
image-side composition (the apkdb_merge rule + gather aspect) follows
the same ergonomic shape across both ecosystems.

- ApkFragmentInfo is the direct provider emitted by `apk_package` rules
  — one per (package, arch). Carries the installed-db fragment file
  plus identity metadata used to sort the merged installed-db.

- TransitiveApkFragmentInfo is the rolled-up depset the `gather_apk_fragments`
  aspect builds as it walks the image. Consumers read `fragments` to
  enumerate every per-package installed-fragment reachable from the
  target.
"""

ApkFragmentInfo = provider(
    doc = "Per-package APK installed-db fragment, attached to apk_package targets.",
    fields = {
        "fragment": "File. Fragment bytes (one APKINDEX-format stanza, output of apk-extract).",
        "package": "string. Package name, e.g. \"tzdata\".",
        "version": "string. Package version, e.g. \"2026a-r0\".",
        "arch": "string. Package architecture, e.g. \"noarch\" or \"x86_64\".",
    },
)

TransitiveApkFragmentInfo = provider(
    doc = "Rolled-up APK fragments gathered by gather_apk_fragments aspect.",
    fields = {
        "fragments": "depset of ApkFragmentInfo structs.",
    },
)
