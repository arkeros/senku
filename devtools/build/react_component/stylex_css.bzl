"Rule to collect StyleX metadata and generate a CSS stylesheet"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def stylex_css(name, components, output, use_layers = False, **kwargs):
    """Collect StyleX CSS from react_component targets into a single stylesheet.

    Args:
        name: target name
        components: list of react_component target labels
        output: output .css file path
        use_layers: use CSS @layer instead of specificity hacks for priority
        **kwargs: passed through to js_run_binary
    """
    metadata = ["{}_transpile_stylex_metadata".format(c) for c in components]

    args = ["--output", "$(location {})".format(output)]
    if use_layers:
        args.append("--use-layers")
    for m in metadata:
        args.append("$(locations {})".format(m))

    js_run_binary(
        name = name,
        srcs = metadata + [
            "//:node_modules/@stylexjs/babel-plugin",
        ],
        outs = [output],
        args = args,
        tool = "//devtools/build/react_component:stylex_collect_css_bin",
        **kwargs
    )
