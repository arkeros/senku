"""`apk_package`: one (package, arch) pair as a Bazel target.

Runs `apk-extract` as a build action: a .apk file → (content.tar,
installed.fragment). Two providers emitted:

- DefaultInfo: the content tar. Drop the target straight into
  `flatten(tars = [...])` like any other layer source.
- ApkFragmentInfo: the installed-db fragment plus identity metadata.
  Picked up by the `gather_apk_fragments` aspect (see gather.bzl) so
  consumers don't have to enumerate fragments manually.

Repo rules can't invoke `apk-extract` directly (it isn't built yet);
extraction runs as an analysis-phase action whose tool input is the
go_binary.
"""

load(":providers.bzl", "ApkFragmentInfo")

def _apk_package_impl(ctx):
    content_tar = ctx.actions.declare_file(ctx.label.name + ".content.tar")
    fragment = ctx.actions.declare_file(ctx.label.name + ".installed.fragment")

    args = ctx.actions.args()
    args.add("--apk", ctx.file.apk)
    args.add("--content-out", content_tar)
    args.add("--installed-out", fragment)
    args.add("--package", ctx.attr.package)
    args.add("--version", ctx.attr.version)
    args.add("--arch", ctx.attr.arch)
    # The APKINDEX C: checksum is no longer plumbed here — apk-extract
    # derives it from the .apk's control segment directly. `checksum`
    # attribute kept for backwards compatibility in the lockfile but
    # ignored by the action.

    ctx.actions.run(
        executable = ctx.executable._extract_tool,
        arguments = [args],
        inputs = [ctx.file.apk],
        outputs = [content_tar, fragment],
        mnemonic = "ApkExtract",
        progress_message = "Extracting %s-%s (%s)" % (ctx.attr.package, ctx.attr.version, ctx.attr.arch),
    )

    return [
        DefaultInfo(files = depset([content_tar])),
        OutputGroupInfo(
            content = depset([content_tar]),
            fragment = depset([fragment]),
        ),
        ApkFragmentInfo(
            fragment = fragment,
            package = ctx.attr.package,
            version = ctx.attr.version,
            arch = ctx.attr.arch,
        ),
    ]

apk_package = rule(
    implementation = _apk_package_impl,
    attrs = {
        "apk": attr.label(
            allow_single_file = [".apk"],
            mandatory = True,
            doc = "Source .apk file (downloaded by apk_package_repo).",
        ),
        "package": attr.string(mandatory = True),
        "version": attr.string(mandatory = True),
        "arch": attr.string(mandatory = True),
        "checksum": attr.string(
            doc = "APKINDEX C: value (Q1<base64-sha1> of control segment). Embedded in the installed fragment so syft and trivy can later re-verify.",
        ),
        "_extract_tool": attr.label(
            default = "@rules_apk//apk/tools/apk-extract",
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Extracts one .apk into a content tar (DefaultInfo) and installed-db fragment (ApkFragmentInfo).",
)
