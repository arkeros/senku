load("@package_metadata//:defs.bzl", "package_metadata")

package(
    default_package_metadata = [":package_metadata"],
    default_visibility = ["//visibility:public"],
)

package_metadata(
    name = "package_metadata",
    purl = "pkg:apk/wolfi/busybox-static@1.37.0-r57?arch=aarch64",
)

genrule(
    name = "data",
    srcs = ["@wolfi_busybox_static_arm64//file"],
    outs = ["busybox-static.tar"],
    # See sibling amd64/BUILD for the rationale on --installed-db-at.
    cmd = "$(execpath //devtools/build/tools/wolfi-apk-extract) --in $< --out $@ --keep usr/bin/busybox --installed-db-at usr/lib/apk/db/installed",
    tools = ["//devtools/build/tools/wolfi-apk-extract"],
)

filegroup(
    name = "arm64",
    srcs = [":data"],
)
