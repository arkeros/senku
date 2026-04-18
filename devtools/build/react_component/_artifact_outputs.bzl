"""Internal rule: expose ts_project JS outputs plus named OutputGroups.

Downstream collectors (stylex_css, asset_pipeline) reach the named
groups via the matching `*_aspect` in _artifact_aspect.bzl — no
per-kind provider, no per-kind wrapper rule. See the design note in
_artifact_aspect.bzl for the broader picture.

Today only the `stylex_metadata` group is wired. When #95 (assets)
lands, the rule gains an `assets` attr and exposes a second group.
"""

def _artifact_outputs_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        OutputGroupInfo(stylex_metadata = depset(own_metadata)),
    ]

artifact_outputs = rule(
    implementation = _artifact_outputs_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(
            allow_files = True,
            default = [],
            doc = ".stylex.json metadata files (empty for non-StyleX rules like asset_library)",
        ),
        "deps": attr.label_list(doc = "Dependency targets (traversed by collection aspects)"),
    },
)
