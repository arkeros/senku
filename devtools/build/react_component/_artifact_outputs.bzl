"""Internal rule: expose ts_project JS outputs plus named OutputGroups.

Downstream collectors (stylex_css, asset_pipeline) reach the named
groups via the matching `*_aspect` in _artifact_aspect.bzl — no
per-kind provider, no per-kind wrapper rule. See the design note in
_artifact_aspect.bzl for the broader picture.

This rule directly exposes the `stylex_metadata` output group. Asset
handling is already wired separately via dependency traversal and
aspects (for example `hash_assets`), rather than through an `assets`
attr on `artifact_outputs`.
"""

def _artifact_outputs_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        OutputGroupInfo(
            stylex_metadata = depset(own_metadata),
            i18n_catalog = depset(ctx.files.i18n),
            i18n_refs = depset(ctx.files.i18n_refs),
        ),
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
        "i18n": attr.label_list(
            allow_files = [".mf2.json"],
            default = [],
            doc = "Per-locale MF2 catalog fragments. Filenames must match the pattern <anything>.<locale>.mf2.json; the merger parses the locale out at aggregate time.",
        ),
        "i18n_refs": attr.label_list(
            allow_files = [".json"],
            default = [],
            doc = "Output of i18n_extract_refs on the component's sources — a JSON index of <Trans id=...> and format(...) call sites that i18n_merge cross-checks against the merged source-locale catalog.",
        ),
        "deps": attr.label_list(doc = "Dependency targets (traversed by collection aspects)"),
    },
)
