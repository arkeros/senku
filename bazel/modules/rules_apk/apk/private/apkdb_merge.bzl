"""`apkdb_merge`: N installed-fragments → one tar containing
/lib/apk/db/installed with the concatenated, sorted records.

Two consumption shapes:

1. Aspect-driven (preferred): pass the image-composition target(s) as
   `srcs` and the aspect walks them, gathering every reachable
   ApkFragmentInfo automatically.

2. Explicit enumeration: pass per-package targets directly as `srcs`.
   Each target must carry ApkFragmentInfo.

The output is a tar layer dropped into `flatten(tars=[...])` alongside
the per-package content tars; together they make a self-describing
distroless image that syft and trivy's apk-db catalogers recognise.
"""

load(":gather.bzl", "gather_apk_fragments")
load(":providers.bzl", "ApkFragmentInfo", "TransitiveApkFragmentInfo")

def _gather_fragments(srcs):
    """Collect ApkFragmentInfo from srcs via either direct or
    transitive providers."""
    direct = []
    transitive = []
    for src in srcs:
        if ApkFragmentInfo in src:
            direct.append(src[ApkFragmentInfo])
        if TransitiveApkFragmentInfo in src:
            transitive.append(src[TransitiveApkFragmentInfo].fragments)
    return depset(direct, transitive = transitive)

def _apkdb_merge_impl(ctx):
    fragments = _gather_fragments(ctx.attr.srcs)
    fragments_list = fragments.to_list()
    if len(fragments_list) == 0:
        fail("apkdb_merge: no ApkFragmentInfo gathered from srcs — confirm the targets are apk_package or their transitive consumers")

    fragment_files = [f.fragment for f in fragments_list]
    out_tar = ctx.actions.declare_file(ctx.label.name + ".tar")

    args = ctx.actions.args()
    args.add("--out", out_tar)
    args.add_all(fragment_files)

    ctx.actions.run(
        executable = ctx.executable._merge_tool,
        arguments = [args],
        inputs = fragment_files,
        outputs = [out_tar],
        mnemonic = "ApkDbMerge",
        progress_message = "Merging APK installed-db for %s" % ctx.label,
    )

    return [DefaultInfo(files = depset([out_tar]))]

apkdb_merge = rule(
    implementation = _apkdb_merge_impl,
    attrs = {
        "srcs": attr.label_list(
            mandatory = True,
            aspects = [gather_apk_fragments],
            doc = "Image-composition targets (carry TransitiveApkFragmentInfo via the aspect) or per-package targets (carry ApkFragmentInfo directly).",
        ),
        "_merge_tool": attr.label(
            default = "@rules_apk//apk/tools/apkdb-merge",
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Concatenates per-package installed-fragments into one /lib/apk/db/installed tar.",
)
