"""Split an esbuild bundle's two unlike outputs apart.

`esbuild_bundle` returns both in one `DefaultInfo` with no output group to
tell them apart: the output directory, which is the site's JavaScript, and —
with `metafile = True` — a sibling JSON holding the whole module graph, every
input path and every resolved dependency version.

They need opposite treatment. The directory is served, publicly, from a
bucket and from the nginx image; the metafile must never be, and exists only
so the HTML generator can learn the entry's content-addressed name. Naming
each half is what keeps that straight. The alternative — passing the target
around whole and filtering downstream with `exclude_srcs_patterns` — covers
the byproduct we know about today and silently ships whatever esbuild emits
next.

See docs/adr/0010-content-addressed-webroot.md.
"""

def _partition(ctx):
    dirs = [f for f in ctx.files.bundle if f.is_directory]
    files = [f for f in ctx.files.bundle if not f.is_directory]
    return dirs, files

def _bundle_dir_impl(ctx):
    dirs, _ = _partition(ctx)
    if len(dirs) != 1:
        fail("%s: expected exactly one output directory from %s, got %d. " %
             (ctx.label, ctx.attr.bundle.label, len(dirs)) +
             "esbuild must be configured with `output_dir = True`.")
    return [DefaultInfo(files = depset(dirs))]

def _bundle_metafile_impl(ctx):
    _, files = _partition(ctx)
    metafiles = [f for f in files if f.basename.endswith("_metadata.json")]
    if len(metafiles) != 1:
        fail("%s: expected exactly one metafile from %s, got %d. " %
             (ctx.label, ctx.attr.bundle.label, len(metafiles)) +
             "esbuild must be configured with `metafile = True`.")
    return [DefaultInfo(files = depset(metafiles))]

bundle_dir = rule(
    implementation = _bundle_dir_impl,
    doc = "The servable half of an `esbuild` target: the output directory alone.",
    attrs = {
        "bundle": attr.label(
            mandatory = True,
            doc = "The `esbuild` target to narrow. Must set `output_dir = True`.",
        ),
    },
)

bundle_metafile = rule(
    implementation = _bundle_metafile_impl,
    doc = "The build-time half of an `esbuild` target: the metafile alone. Never servable.",
    attrs = {
        "bundle": attr.label(
            mandatory = True,
            doc = "The `esbuild` target to narrow. Must set `metafile = True`.",
        ),
    },
)
