"Rule to collect StyleX metadata transitively and generate a CSS stylesheet"

load(":providers.bzl", "StylexInfo")

def _stylex_css_impl(ctx):
    # Collect metadata transitively from all components via StylexInfo
    all_metadata = depset(transitive = [
        dep[StylexInfo].metadata
        for dep in ctx.attr.components
        if StylexInfo in dep
    ])
    metadata_files = all_metadata.to_list()

    if not metadata_files:
        # No metadata — write empty CSS
        ctx.actions.write(ctx.outputs.output, "")
        return [DefaultInfo(files = depset([ctx.outputs.output]))]

    args = ctx.actions.args()
    args.add("--output", ctx.outputs.output)
    if ctx.attr.use_layers:
        args.add("--use-layers")
    args.add_all(metadata_files)

    ctx.actions.run(
        inputs = depset(metadata_files, transitive = [
            ctx.attr._tool[DefaultInfo].default_runfiles.files,
        ]),
        outputs = [ctx.outputs.output],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
    )

    return [DefaultInfo(files = depset([ctx.outputs.output]))]

stylex_css = rule(
    implementation = _stylex_css_impl,
    attrs = {
        "components": attr.label_list(
            doc = "react_component targets (StylexInfo collected transitively)",
        ),
        "use_layers": attr.bool(
            default = False,
            doc = "Use CSS @layer instead of specificity hacks",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:stylex_collect_css_bin",
            executable = True,
            cfg = "exec",
        ),
    },
    outputs = {"output": "%{name}.css"},
)
