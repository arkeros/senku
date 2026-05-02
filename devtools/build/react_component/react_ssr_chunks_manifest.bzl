"""Run the chunks-manifest post-process on an esbuild bundle's metafile.

Why a custom rule rather than `genrule` / `js_run_binary`: `js_run_binary`
copies its `srcs` to bin via `copy_to_bin`, which fails on the metafile
because it's a runtime-declared output (via `ctx.actions.declare_file`)
rather than a predeclared one — Bazel doesn't auto-create the
`:{name}_client_bundle_metadata.json` label, so other rules can't
consume it by name. This rule sidesteps that by reading the bundle
target's `DefaultInfo.files` directly and filtering for the file whose
basename is `<bundle_name>_metadata.json`.
"""

def _react_ssr_chunks_manifest_impl(ctx):
    # Find the metafile inside the bundle target's DefaultInfo files.
    bundle_files = ctx.attr.bundle[DefaultInfo].files.to_list()
    metafile = None
    for f in bundle_files:
        if f.basename.endswith("_metadata.json"):
            metafile = f
            break
    if metafile == None:
        fail(
            "react_ssr_chunks_manifest: no metafile found in {}'s outputs. ".format(ctx.attr.bundle.label) +
            "Did you set `metafile = True` on the esbuild rule?",
        )

    args = ctx.actions.args()
    args.add("--metafile", metafile.path)
    args.add("--out", ctx.outputs.out.path)
    args.add("--url-prefix", ctx.attr.url_prefix)

    ctx.actions.run(
        inputs = [metafile],
        outputs = [ctx.outputs.out],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "ReactSsrChunksManifest",
        progress_message = "Building chunks manifest for %s" % ctx.label,
    )

    return [DefaultInfo(files = depset([ctx.outputs.out]))]

react_ssr_chunks_manifest = rule(
    implementation = _react_ssr_chunks_manifest_impl,
    attrs = {
        "bundle": attr.label(
            mandatory = True,
            doc = "esbuild target with `metafile = True` set; its " +
                  "`*_metadata.json` is the input.",
        ),
        "url_prefix": attr.string(
            mandatory = True,
            doc = "URL prefix the bundled chunks are served at " +
                  "(e.g. `/foo_client_bundle/`); prepended to each chunk's " +
                  "basename in the output JSON.",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:react_ssr_chunks_manifest_bin",
            executable = True,
            cfg = "exec",
        ),
    },
    outputs = {"out": "%{name}.json"},
)
