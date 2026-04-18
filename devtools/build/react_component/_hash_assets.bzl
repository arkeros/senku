"""Rule: content-hash a set of asset srcs into a TreeArtifact + manifest file.

Hashed filenames depend on file bytes, so they can't be `declare_file`d at
analysis time. Declare a directory (TreeArtifact) that the Go tool
populates with `<stem>.<hash12>.<ext>` entries, and a sibling manifest
file mapping original basenames → hashed filenames.

Downstream consumers (`asset_codegen`, `asset_pipeline`) read the
manifest at action time to discover the hashed names; there's no need
to know them at analysis time.

Exposes both as named output groups so `assets_aspect` and
`asset_manifest_aspect` can walk deps and aggregate transitively.
"""

def _hash_assets_impl(ctx):
    if not ctx.files.srcs:
        fail("_hash_assets: srcs must not be empty (target %s)" % ctx.label)

    tree = ctx.actions.declare_directory(ctx.label.name + "_dir")
    manifest = ctx.actions.declare_file(ctx.label.name + ".manifest.json")

    args = ctx.actions.args()
    args.add("--out-dir", tree.path)
    args.add("--manifest", manifest.path)
    args.add_all(ctx.files.srcs)

    ctx.actions.run(
        inputs = ctx.files.srcs,
        outputs = [tree, manifest],
        executable = ctx.executable._tool,
        arguments = [args],
        mnemonic = "HashAssets",
        progress_message = "Hashing %d asset(s) for %s" % (len(ctx.files.srcs), ctx.label),
    )

    return [
        DefaultInfo(files = depset([tree, manifest])),
        OutputGroupInfo(
            assets = depset([tree]),
            asset_manifest = depset([manifest]),
        ),
    ]

hash_assets = rule(
    implementation = _hash_assets_impl,
    attrs = {
        "srcs": attr.label_list(
            allow_files = True,
            mandatory = True,
            doc = "Asset files to content-hash. Basenames must be unique within the target.",
        ),
        "_tool": attr.label(
            default = "//devtools/build/tools/hash_and_copy",
            executable = True,
            cfg = "exec",
        ),
    },
)
