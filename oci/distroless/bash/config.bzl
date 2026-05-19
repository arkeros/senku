BASH_DISTROS = ["debian", "hummingbird", "wolfi"]

BASH_ARCHITECTURES = {
    # "debian12": ["amd64", "arm64", "arm", "s390x", "ppc64le"],
    "debian": ["amd64", "arm64"],
    "hummingbird": ["amd64", "arm64"],
    "wolfi": ["amd64", "arm64"],
}

def bash_layers(ctx):
    """Composition: static + (busybox if debug) + cc + bash + one db."""
    layers = [
        "//oci/distroless/static:static_{}_{}_layer".format(ctx.arch, ctx.distro),
    ]
    if ctx.mode == "_debug" and ctx.distro != "wolfi":
        # Wolfi has no busybox layer yet; debug == release.
        layers.append("//oci/distroless/static:busybox_{}_{}_layer".format(ctx.arch, ctx.distro))
    layers += [
        "//oci/distroless/cc:cc_{}_{}_layer".format(ctx.arch, ctx.distro),
        ":{}_{}_layer".format(ctx.arch, ctx.distro),
    ]
    if ctx.distro == "hummingbird":
        rpmdb = ":rpmdb_bash_debug_{}_hummingbird" if ctx.mode == "_debug" else ":rpmdb_bash_{}_hummingbird"
        layers.append(rpmdb.format(ctx.arch))
    elif ctx.distro == "wolfi":
        layers.append(":apkdb_bash_{}_wolfi".format(ctx.arch))
    return layers
