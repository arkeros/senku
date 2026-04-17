"Internal rule: expose ts_project JS outputs and propagate StylexInfo transitively."

load(":providers.bzl", "StylexInfo")

def _stylex_outputs_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
    ]

stylex_outputs = rule(
    implementation = _stylex_outputs_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(allow_files = True, doc = ".stylex.json metadata files"),
        "deps": attr.label_list(doc = "Other StylexInfo-bearing targets (for transitive metadata)"),
    },
)
