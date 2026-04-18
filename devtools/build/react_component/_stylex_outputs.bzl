"Internal rule: expose ts_project JS outputs and propagate StylexInfo transitively."

# DESIGN NOTE — generalization path chosen: (b) output-group aspect.
#
# Path (a) was: rename StylexInfo → TranspilerMetadataInfo with a `kind`
# tag. Path (b) was: emit a named OutputGroup from the rule, walk deps
# via a parametrized aspect. (b) was picked when the second caller
# (static assets, #95) landed — one aspect walks deps for any named
# group, so assets, stylex metadata, and future kinds (i18n, CSS
# Modules, WASM) share one traversal primitive.
#
# Migration state (mid-cutover): the rule currently emits BOTH
# StylexInfo AND OutputGroupInfo(stylex_metadata=...). Once stylex_css
# switches to the aspect (next commit), StylexInfo is deleted and this
# file gets renamed to _artifact_outputs.bzl.

load(":providers.bzl", "StylexInfo")

def _stylex_outputs_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
        OutputGroupInfo(stylex_metadata = depset(own_metadata)),
    ]

stylex_outputs = rule(
    implementation = _stylex_outputs_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(allow_files = True, doc = ".stylex.json metadata files"),
        "deps": attr.label_list(doc = "Other StylexInfo-bearing targets (for transitive metadata)"),
    },
)
