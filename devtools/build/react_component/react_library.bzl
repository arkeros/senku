"Wrapper rule that carries StylexInfo and ReactComponentInfo providers"

load(":providers.bzl", "ReactComponentInfo", "StylexInfo")

def _react_library_impl(ctx):
    # Collect own .stylex.json metadata files
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]

    # Collect transitive metadata from deps
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    # Find the main entry file (matches entry_name) among supported JS module outputs
    js_entry = None
    expected_entries = [
        ctx.attr.entry_name + ".js",
        ctx.attr.entry_name + ".mjs",
    ]
    for f in ctx.files.js_outs:
        if f.basename in expected_entries:
            js_entry = f
            break

    if not js_entry:
        fail("react_library: could not find {}.js or {}.mjs in js_outs".format(
            ctx.attr.entry_name,
            ctx.attr.entry_name,
        ))

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
        ReactComponentInfo(js_entry = js_entry, name = ctx.attr.entry_name),
    ]

react_library = rule(
    implementation = _react_library_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(allow_files = True, doc = ".stylex.json metadata files"),
        "entry_name": attr.string(mandatory = True, doc = "Component name (used to find the .js entry)"),
        "deps": attr.label_list(doc = "Other react_component targets (for transitive StylexInfo)"),
    },
)
