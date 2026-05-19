"""Public re-exports. Consumers `load("@rules_apk", "apk_package", "apkdb_merge")`."""

load("//apk:defs.bzl", _apk_package = "apk_package", _apkdb_merge = "apkdb_merge")

apk_package = _apk_package
apkdb_merge = _apkdb_merge
