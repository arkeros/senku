"""`apk_pin`: runnable target inside the hub repo that updates the
lockfile. Invoked as `bazel run @<name>//:pin`.

Genrule-style wrapper around the pin Go binary; the binary fetches and
verifies APKINDEX.tar.gz, parses every record, resolves the declared
package names across all declared architectures, sha256s every .apk in
the closure, and writes the JSON lockfile back to its source-tree path
via BUILD_WORKSPACE_DIRECTORY.
"""

def _apk_pin_impl(ctx):
    script = ctx.actions.declare_file(ctx.label.name + ".sh")
    ctx.actions.expand_template(
        template = ctx.file._template,
        output = script,
        is_executable = True,
        substitutions = {
            "{TOOL}": ctx.executable._tool.short_path,
            "{REPO_URL}": ctx.attr.repo_url,
            "{SIGNING_KEY}": ctx.file.signing_key.short_path,
            "{LOCK_FILE}": ctx.attr.lock_file,
            "{PACKAGES}": ",".join(ctx.attr.packages),
            "{ARCHITECTURES}": ",".join(ctx.attr.architectures),
        },
    )
    return [DefaultInfo(
        executable = script,
        runfiles = ctx.runfiles(files = [ctx.executable._tool, ctx.file.signing_key]),
    )]

apk_pin = rule(
    implementation = _apk_pin_impl,
    executable = True,
    attrs = {
        "repo_url": attr.string(mandatory = True),
        "signing_key": attr.label(allow_single_file = True, mandatory = True),
        "packages": attr.string_list(mandatory = True),
        "architectures": attr.string_list(mandatory = True),
        "lock_file": attr.string(mandatory = True),
        "_tool": attr.label(
            default = "@rules_apk//apk/tools/pin",
            executable = True,
            cfg = "exec",
        ),
        "_template": attr.label(
            default = "@rules_apk//apk/private:pin.sh.tpl",
            allow_single_file = True,
        ),
    },
)
