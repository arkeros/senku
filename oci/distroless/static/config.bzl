"Configuration for static distroless images"

STATIC_DISTROS = ["debian", "hummingbird", "wolfi"]

# Hummingbird's static package set is all-noarch (tzdata, ca-certificates,
# mailcap), so amd64 and arm64 images share identical content layers — only
# the OCI manifest's platform field differs. arch-specific arches (e.g.
# glibc.x86_64 vs glibc.aarch64) land once cc migrates.
#
# Wolfi's static set is similar (wolfi-baselayout / ca-certificates-bundle
# / tzdata, mostly noarch); arch-specific arches arrive with cc.
STATIC_ARCHITECTURES = {
    "debian": ["amd64", "arm64"],
    "hummingbird": ["amd64", "arm64"],
    "wolfi": ["amd64", "arm64"],
}

def static_layers(ctx):
    layers = [":static_{}_{}_layer".format(ctx.arch, ctx.distro)]
    if ctx.distro == "hummingbird":
        # rpmdb sqlite tar is a separate layer so syft's rpm-db cataloger
        # finds /usr/lib/sysimage/rpm/rpmdb.sqlite. Aspect-collected per
        # ADR 0007 §"aspect-driven rpmdb_merge".
        layers.append(":rpmdb_{}_hummingbird".format(ctx.arch))
    elif ctx.distro == "wolfi":
        # /lib/apk/db/installed tar from apkdb_merge — text-concat of
        # per-package installed-fragments, no sqlite involved. Single
        # binary, no fan-out merge complexity (see rules_apk/README).
        layers.append(":apkdb_{}_wolfi".format(ctx.arch))
    return layers

def static_debug_layers(ctx):
    # Composition (no base inheritance): debug = release content + busybox.
    # The release flatten provides rootfs, /etc/passwd, /etc/group,
    # /etc/os-release, ca-certificates, tzdata, etc. Without it the debug
    # image would be just busybox sitting on a bare filesystem.
    #
    # Wolfi: busybox isn't in the apk.install closure yet — debug ==
    # release for now (matches hummingbird's pre-busybox posture). When
    # `busybox` lands in @wolfi, lift the conditional and add the layer.
    layers = [":static_{}_{}_layer".format(ctx.arch, ctx.distro)]
    if ctx.distro != "wolfi":
        layers.append(":busybox_{}_{}_layer".format(ctx.arch, ctx.distro))
    if ctx.distro == "hummingbird":
        # Replaces the static-release rpmdb at the same sqlite path with
        # one that includes busybox — grype routes its CVEs via the
        # hummingbird provider rather than NVD-generic-via-binary-cataloger.
        layers.append(":rpmdb_debug_{}_hummingbird".format(ctx.arch))
    elif ctx.distro == "wolfi":
        layers.append(":apkdb_{}_wolfi".format(ctx.arch))
    return layers
