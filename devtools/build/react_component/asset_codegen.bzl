"""Rule: emit a TypeScript URL-consts module from a hash_and_copy manifest.

Takes the manifest produced by `_hash_assets` and emits
`<name>.assets.ts` (or whatever `out` names it) with a typed `*Url`
export per asset. Consumers import the module like any other TS source.

Identifier derivation and collision detection live in
`asset_codegen.mjs` — the rule is a thin wrapper that runs the tool.
"""

def _asset_codegen_impl(ctx):
    # Pull the manifest out of the hash_assets target's `asset_manifest`
    # output group. This avoids making the caller predict the manifest
    # filename, and keeps the wiring in one place (the rule, not the macro).
    og = ctx.attr.hashed[OutputGroupInfo]
    if not hasattr(og, "asset_manifest"):
        fail("asset_codegen: %s does not expose OutputGroupInfo.asset_manifest" % ctx.attr.hashed.label)
    manifest_files = og.asset_manifest.to_list()
    if len(manifest_files) != 1:
        fail("asset_codegen: expected exactly one asset_manifest file from %s, got %d" % (
            ctx.attr.hashed.label,
            len(manifest_files),
        ))
    manifest = manifest_files[0]

    args = ctx.actions.args()
    args.add("--manifest", manifest.path)
    args.add("--out", ctx.outputs.out.path)
    if ctx.attr.url_prefix:
        args.add("--url-prefix", ctx.attr.url_prefix)

    ctx.actions.run(
        inputs = [manifest],
        outputs = [ctx.outputs.out],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "AssetCodegen",
        progress_message = "Generating %s" % ctx.outputs.out.short_path,
    )

    return [DefaultInfo(files = depset([ctx.outputs.out]))]

asset_codegen = rule(
    implementation = _asset_codegen_impl,
    attrs = {
        "hashed": attr.label(
            mandatory = True,
            providers = [OutputGroupInfo],
            doc = "A hash_assets target whose `asset_manifest` output group holds the manifest to read.",
        ),
        "out": attr.output(
            mandatory = True,
            doc = "Output .ts file name (e.g. `Header.assets.ts`).",
        ),
        "url_prefix": attr.string(
            default = "/assets/",
            doc = "URL path prefix prepended to each hashed filename in the output.",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:asset_codegen_bin",
            executable = True,
            cfg = "exec",
        ),
    },
)
