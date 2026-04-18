"""App-level aggregator: merges per-leaf asset trees/manifests into one.

Walks `components` via the `assets_aspect` + `asset_manifest_aspect` to
collect every hashed asset tree + per-leaf manifest reachable through
`deps`. Produces:

  - `<name>_flat/` — a single flat TreeArtifact with all hashed asset files,
    ready to be served at `/assets/` or copied into a prod bundle.
  - `<name>.json` — devserver manifest mapping URL path → filename under
    `<name>_flat/` (consumed by `devserver.mjs`).

Mirrors the browser_dep_group shape (manifest + sibling directory),
so the devserver can treat asset serving uniformly with npm-dep serving.
"""

load(":_artifact_aspect.bzl", "AssetManifestCollection", "AssetsCollection", "asset_manifest_aspect", "assets_aspect")

def _asset_pipeline_impl(ctx):
    trees = depset(transitive = [
        c[AssetsCollection].files
        for c in ctx.attr.components
        if AssetsCollection in c
    ]).to_list()
    manifests = depset(transitive = [
        c[AssetManifestCollection].files
        for c in ctx.attr.components
        if AssetManifestCollection in c
    ]).to_list()

    if len(trees) != len(manifests):
        fail("asset_pipeline: collected %d trees but %d manifests; hash_assets should emit pairs" % (len(trees), len(manifests)))

    # Only the manifest is pre-declared via the rule's `outputs` template,
    # so it gets a separate output label (`:%{name}.json`). The asset tree
    # is declared in the implementation and returned in DefaultInfo, which
    # still makes it a valid output of this target, but not as a distinct
    # sibling label such as `:target_flat` unless exposed separately.
    manifest = ctx.outputs.manifest
    flat_dir = ctx.actions.declare_directory(ctx.label.name + "_flat")

    args = ctx.actions.args()
    args.add("--out-dir", flat_dir.path)
    args.add("--manifest", manifest.path)
    args.add("--url-prefix", ctx.attr.url_prefix)

    # Pair each per-leaf manifest with its sibling tree by construction:
    # hash_assets declares `<name>.manifest.json` + `<name>_dir/` together,
    # so matching by the stem of the manifest filename finds the right
    # tree every time.
    trees_by_name = {t.basename: t for t in trees}
    for mf in manifests:
        stem = mf.basename[:-len(".manifest.json")] if mf.basename.endswith(".manifest.json") else mf.basename
        tree_name = stem + "_dir"
        tree = trees_by_name.get(tree_name)
        if tree == None:
            fail("asset_pipeline: no tree artifact matching manifest %s (expected %s)" % (mf.path, tree_name))
        args.add("--pair", mf.path)
        args.add(tree.path)

    ctx.actions.run(
        inputs = trees + manifests,
        outputs = [flat_dir, manifest],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "AssetPipeline",
        progress_message = "Aggregating assets for %s" % ctx.label,
    )

    # Keep DefaultInfo single-file so `$(location :target)` resolves
    # unambiguously to the tree dir. The manifest is addressable via its
    # pre-declared label `:target.json` (from the rule's `outputs` template).
    return [
        DefaultInfo(files = depset([flat_dir])),
        OutputGroupInfo(
            assets_dir = depset([flat_dir]),
            devserver_manifest = depset([manifest]),
        ),
    ]

asset_pipeline = rule(
    implementation = _asset_pipeline_impl,
    attrs = {
        "components": attr.label_list(
            aspects = [assets_aspect, asset_manifest_aspect],
            doc = "react_component / asset_library targets; assets collected transitively.",
        ),
        "url_prefix": attr.string(
            default = "/assets/",
            doc = "URL path prefix for hashed files. Must match the prefix used by asset_codegen on the producing rules.",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:asset_manifest_merge_bin",
            executable = True,
            cfg = "exec",
        ),
    },
    outputs = {
        "manifest": "%{name}.json",
    },
)
