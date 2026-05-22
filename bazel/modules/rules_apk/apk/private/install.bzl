"""Two repository_rules: per-package spoke and hub.

Spoke (`apk_package_repo`): downloads one .apk from `url`, verifies
sha256 via repository_ctx.download.

Hub (`apk_install_repo`): an aliases-only repo. Re-exports every spoke
under `@<name>//<pkg>/<arch>:package`, plus a `:pin` runnable that
shells out to the pin Go binary against the live repo.
"""

# Bazel repo names must match `[A-Za-z0-9._-]+`. APK package names
# include characters that violate this — most notably `+` in C++ stdlib
# (`libstdc++`) and historical names. Same encoding as
# rules_rpm.safe_repo_name: map `+` to `.plus.` for the spoke repo
# name only; the hub-side alias under `@<hub>//<pkg>/<arch>` keeps the
# original `+` (Bazel package directories accept it).
#
# Not strictly bijective: a hypothetical APK named `lib.plus.x` would
# collide with `lib+x`. Guard against the theoretical collision so a
# real hit fails loud — currently no wolfi/alpine package uses
# `.plus.` as a substring. Graduating to a fully bijective scheme
# (e.g. `_p` with `_` doubled) would invalidate every existing spoke
# cache key, so save that move for if/when the guard ever fires.
def safe_repo_name(s):
    if ".plus." in s:
        fail(
            ("rules_apk: package name %r contains '.plus.', which would " +
             "collide with the spoke-repo encoding of a '+' in another name. " +
             "Extend safe_repo_name to a bijective scheme before adding this package.") % s,
        )
    return s.replace("+", ".plus.")

def _apk_purl(namespace, name, version, arch, origin, distro):
    # purl-spec for apk: pkg:apk/<namespace>/<name>@<version>?<qualifiers>
    # No epoch (apk has no epoch concept). `distro=<id>` is the
    # consumer-side secdb routing key grype uses — wolfi for wolfi
    # packages, alpine-3.20 for alpine, etc. `origin` is the source
    # package name (different from `name` for multi-output abuilds).
    parts = ["arch=" + arch]
    if origin and origin != name:
        parts.append("upstream=" + origin)
    if distro:
        parts.append("distro=" + distro)
    return "pkg:apk/{ns}/{name}@{ver}?{q}".format(
        ns = namespace,
        name = name,
        ver = version,
        q = "&".join(parts),
    )

def _apk_package_repo_impl(rctx):
    rctx.download(
        url = rctx.attr.url,
        sha256 = rctx.attr.sha256,
        output = "package.apk",
    )

    purl = _apk_purl(
        namespace = rctx.attr.purl_namespace,
        name = rctx.attr.package,
        version = rctx.attr.version,
        arch = rctx.attr.arch,
        origin = rctx.attr.origin,
        distro = rctx.attr.purl_distro,
    )

    rctx.file("BUILD.bazel", """
load("@package_metadata//:defs.bzl", "package_metadata")
load("@rules_apk//apk/private:per_package.bzl", "apk_package")

package(
    default_package_metadata = [":package_metadata"],
    default_visibility = ["//visibility:public"],
)

exports_files(["package.apk"])

package_metadata(
    name = "package_metadata",
    purl = {purl},
    visibility = ["//visibility:public"],
)

apk_package(
    name = "package",
    apk = "package.apk",
    package = {package},
    version = {version},
    arch = {arch},
    checksum = {checksum},
)
""".format(
        package = repr(rctx.attr.package),
        version = repr(rctx.attr.version),
        arch = repr(rctx.attr.arch),
        checksum = repr(rctx.attr.checksum),
        purl = repr(purl),
    ))

apk_package_repo = repository_rule(
    implementation = _apk_package_repo_impl,
    attrs = {
        "package": attr.string(mandatory = True),
        "version": attr.string(mandatory = True),
        "arch": attr.string(mandatory = True),
        "url": attr.string(mandatory = True),
        "sha256": attr.string(mandatory = True),
        "checksum": attr.string(
            doc = "APKINDEX C: value (Q1<base64-sha1> of control). Forwarded to apk-extract for installed-db fragment synthesis.",
        ),
        "purl_namespace": attr.string(
            mandatory = True,
            doc = "purl namespace identifying the upstream (e.g. 'wolfi', 'alpine'). Drives the `pkg:apk/<namespace>/<name>` shape grype routes by.",
        ),
        "origin": attr.string(
            doc = "Source package name from APKINDEX `o:` field — embedded as `?upstream=...` when it differs from the package name.",
        ),
        "purl_distro": attr.string(
            doc = "Consumer-side distro routing key (e.g. 'wolfi', 'alpine-3.20'). Embedded as `?distro=...` qualifier.",
        ),
    },
)

def _apk_install_repo_impl(rctx):
    arches = rctx.attr.architectures + ["noarch"]
    for pkg in rctx.attr.packages:
        for arch in arches:
            spoke = "@@{}__{}__{}".format(rctx.attr.name, safe_repo_name(pkg), arch)
            rctx.file(
                "%s/%s/BUILD.bazel" % (pkg, arch),
                """
package(default_visibility = ["//visibility:public"])

alias(name = "{arch}",   actual = "{spoke}//:package")
alias(name = "package",  actual = "{spoke}//:package")
""".format(arch = arch, spoke = spoke),
            )

    # Stub aliases for manifest roots not present in the lockfile —
    # surfacing a useful error if a consumer adds to packages= without
    # running :pin.
    lock_keys = {pkg: True for pkg in rctx.attr.packages}
    for pkg in rctx.attr.package_list:
        if pkg in lock_keys:
            continue
        for arch in arches:
            rctx.file(
                "%s/%s/BUILD.bazel" % (pkg, arch),
                'fail("rules_apk: lockfile is stale — manifest root \\"{pkg}\\" is not in the lockfile. Run `bazel run @{name}//:pin` to refresh.")\n'.format(
                    pkg = pkg,
                    name = rctx.attr.name,
                ),
            )

    rctx.file("BUILD.bazel", """
load("@rules_apk//apk/private:pin.bzl", "apk_pin")

package(default_visibility = ["//visibility:public"])

apk_pin(
    name = "pin",
    repo_url = {repo_url},
    signing_key = {signing_key},
    packages = {packages},
    architectures = {architectures},
    lock_file = {lock_file},
)
""".format(
        repo_url = repr(rctx.attr.repo_url),
        signing_key = repr(str(rctx.attr.signing_key)),
        packages = repr(rctx.attr.package_list),
        architectures = repr(rctx.attr.architectures),
        lock_file = repr(str(rctx.attr.lock_file)),
    ))

apk_install_repo = repository_rule(
    implementation = _apk_install_repo_impl,
    attrs = {
        "packages": attr.string_list(mandatory = True),
        "architectures": attr.string_list(mandatory = True),
        "package_list": attr.string_list(mandatory = True),
        "repo_url": attr.string(mandatory = True),
        "signing_key": attr.label(allow_single_file = True, mandatory = True),
        "lock_file": attr.label(allow_single_file = True, mandatory = True),
    },
)
