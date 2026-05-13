load("@package_metadata//:defs.bzl", "package_metadata")

package(
    default_package_metadata = [":package_metadata"],
    default_visibility = ["//visibility:public"],
)

package_metadata(
    name = "package_metadata",
    purl = "pkg:apk/wolfi/busybox-static@1.37.0-r57?arch=x86_64",
)

genrule(
    name = "data",
    srcs = ["@wolfi_busybox_static_amd64//file"],
    outs = ["busybox-static.tar"],
    cmd = "$(execpath //devtools/build/tools/wolfi-apk-extract) --in $< --out $@ --keep usr/bin/busybox",
    tools = ["//devtools/build/tools/wolfi-apk-extract"],
)

filegroup(
    name = "amd64",
    srcs = [":data"],
)
