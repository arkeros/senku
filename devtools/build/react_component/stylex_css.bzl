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

    if not metadata_files and not ctx.files.base_css:
        ctx.actions.write(ctx.outputs.output, "")
        return [DefaultInfo(files = depset([ctx.outputs.output]))]

    # Build the StyleX CSS first
    if metadata_files:
        stylex_output = ctx.actions.declare_file(ctx.label.name + "_stylex_only.css")
        args = ctx.actions.args()
        args.add("--output", stylex_output)
        if ctx.attr.use_layers:
            args.add("--use-layers")
        args.add_all(metadata_files)

        ctx.actions.run(
            inputs = depset(metadata_files, transitive = [
                ctx.attr._tool[DefaultInfo].default_runfiles.files,
            ]),
            outputs = [stylex_output],
            executable = ctx.executable._tool,
            arguments = [args],
            env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        )
    else:
        stylex_output = None

    # Concatenate base CSS files + StyleX CSS into final output
    inputs = list(ctx.files.base_css)
    if stylex_output:
        inputs.append(stylex_output)

    if len(inputs) == 1 and not ctx.files.base_css:
        # Only StyleX CSS, no base — just use it directly
        ctx.actions.run_shell(
            inputs = [stylex_output],
            outputs = [ctx.outputs.output],
            command = "cp $1 $2",
            arguments = [stylex_output.path, ctx.outputs.output.path],
        )
    else:
        # Concatenate all CSS files
        ctx.actions.run_shell(
            inputs = inputs,
            outputs = [ctx.outputs.output],
            command = "cat " + " ".join([f.path for f in inputs]) + " > $1",
            arguments = [ctx.outputs.output.path],
        )

    return [DefaultInfo(files = depset([ctx.outputs.output]))]

stylex_css = rule(
    implementation = _stylex_css_impl,
    attrs = {
        "components": attr.label_list(
            doc = "react_component targets (StylexInfo collected transitively)",
        ),
        "base_css": attr.label_list(
            allow_files = [".css"],
            doc = "CSS files to prepend (e.g. Open Props, resets)",
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
