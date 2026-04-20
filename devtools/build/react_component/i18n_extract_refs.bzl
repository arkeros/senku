"""Per-component rule that emits a JSON index of i18n id references in srcs."""

def _i18n_extract_refs_impl(ctx):
    out = ctx.outputs.out

    args = ctx.actions.args()
    args.add("--out", out.path)
    for s in ctx.files.srcs:
        args.add("--src", s.path)

    ctx.actions.run(
        inputs = ctx.files.srcs,
        outputs = [out],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "I18nExtractRefs",
        progress_message = "Extracting i18n refs for %s" % ctx.label,
    )

    return [DefaultInfo(files = depset([out]))]

i18n_extract_refs = rule(
    implementation = _i18n_extract_refs_impl,
    attrs = {
        "srcs": attr.label_list(
            allow_files = [".ts", ".tsx", ".mts"],
            mandatory = True,
        ),
        "out": attr.output(
            mandatory = True,
            doc = "Output JSON filename (e.g. `<Component>_i18n_refs.json`).",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:i18n_extract_refs_bin",
            executable = True,
            cfg = "exec",
        ),
    },
)
