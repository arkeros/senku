"Rule to collect StyleX metadata transitively and generate a CSS stylesheet"

load(":_artifact_aspect.bzl", "StylexMetadataCollection", "stylex_metadata_aspect")

def _stylex_css_impl(ctx):
    # Collect metadata transitively via the output-group aspect. Each
    # visited target contributes its own .stylex.json files via
    # OutputGroupInfo(stylex_metadata=...); the aspect walks deps.
    all_metadata = depset(transitive = [
        dep[StylexMetadataCollection].files
        for dep in ctx.attr.components
        if StylexMetadataCollection in dep
    ])
    metadata_files = all_metadata.to_list()

    if not metadata_files:
        ctx.actions.write(ctx.outputs.output, "")
        return [DefaultInfo(files = depset([ctx.outputs.output]))]

    # Step 1: Generate StyleX-only CSS
    stylex_css = ctx.actions.declare_file(ctx.label.name + "_stylex_only.css")
    args = ctx.actions.args()
    args.add("--output", stylex_css)
    if ctx.attr.use_layers:
        args.add("--use-layers")
    args.add_all(metadata_files)

    ctx.actions.run(
        inputs = depset(metadata_files, transitive = [
            ctx.attr._stylex_tool[DefaultInfo].default_runfiles.files,
        ]),
        outputs = [stylex_css],
        executable = ctx.executable._stylex_tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
    )

    if ctx.attr.jit_open_props:
        # Step 2: Run postcss-jit-props to inject only used Open Props
        ctx.actions.run(
            inputs = depset([stylex_css], transitive = [
                ctx.attr._postcss_tool[DefaultInfo].default_runfiles.files,
            ]),
            outputs = [ctx.outputs.output],
            executable = ctx.executable._postcss_tool,
            arguments = ["--input", stylex_css.path, "--output", ctx.outputs.output.path],
            env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        )
    else:
        # No jit — just copy the StyleX CSS
        ctx.actions.run_shell(
            inputs = [stylex_css],
            outputs = [ctx.outputs.output],
            command = "cp $1 $2",
            arguments = [stylex_css.path, ctx.outputs.output.path],
        )

    return [DefaultInfo(files = depset([ctx.outputs.output]))]

stylex_css = rule(
    implementation = _stylex_css_impl,
    attrs = {
        "components": attr.label_list(
            aspects = [stylex_metadata_aspect],
            doc = "react_component / stylex_library targets (stylex metadata collected transitively via aspect)",
        ),
        "jit_open_props": attr.bool(
            default = False,
            doc = "Run postcss-jit-props to include only used Open Props custom properties",
        ),
        "use_layers": attr.bool(
            default = False,
            doc = "Use CSS @layer instead of specificity hacks",
        ),
        "_stylex_tool": attr.label(
            default = "//devtools/build/react_component:stylex_collect_css_bin",
            executable = True,
            cfg = "exec",
        ),
        "_postcss_tool": attr.label(
            default = "//devtools/build/react_component:postcss_jit_bin",
            executable = True,
            cfg = "exec",
        ),
    },
    outputs = {"output": "%{name}.css"},
)
