"Configuration for nodejs distroless images"

NODEJS_DISTROS = ["hummingbird", "wolfi"]

NODEJS_ARCHITECTURES = {
    "hummingbird": ["amd64", "arm64"],
    "wolfi": ["amd64", "arm64"],
}

# ADR 0007 step 6 ships 20/24/26 from nodejs.org tarballs on the cc base
# (hummingbird or wolfi). Refresh by bumping these three majors plus the
# matching http_archive entries in //bazel/include/oci.MODULE.bazel
# (versions + SHASUMS256 from https://nodejs.org/dist/v<version>/SHASUMS256.txt).
NODEJS_VERSIONS = {
    "20": "20.20.2",
    "24": "24.15.0",
    "26": "26.1.0",
}

NODEJS_MAJOR_VERSIONS = list(NODEJS_VERSIONS.keys())

def nodejs_layers(major_version):
    """Composition: static + (busybox if debug) + cc + nodejs + one db.

    No base inheritance; everything is explicit. Branches on ctx.mode to
    add busybox + a busybox-aware rpmdb for the `_debug` variant.
    """

    def _layers(ctx):
        layers = [
            "//oci/distroless/static:static_{}_{}_layer".format(ctx.arch, ctx.distro),
        ]
        if ctx.mode == "_debug" and ctx.distro != "wolfi":
            layers.append("//oci/distroless/static:busybox_{}_{}_layer".format(ctx.arch, ctx.distro))
        layers += [
            "//oci/distroless/cc:cc_{}_{}_layer".format(ctx.arch, ctx.distro),
            "//oci/distroless/nodejs:nodejs_{}_{}_{}_layer".format(major_version, ctx.arch, ctx.distro),
        ]
        if ctx.distro == "hummingbird":
            if ctx.mode == "_debug":
                layers.append("//oci/distroless/nodejs:rpmdb_nodejs_debug_{}_{}_hummingbird".format(major_version, ctx.arch))
            else:
                layers.append("//oci/distroless/nodejs:rpmdb_nodejs_{}_{}_hummingbird".format(major_version, ctx.arch))
        elif ctx.distro == "wolfi":
            layers.append("//oci/distroless/nodejs:apkdb_nodejs_{}_{}_wolfi".format(major_version, ctx.arch))
        return layers

    return _layers
