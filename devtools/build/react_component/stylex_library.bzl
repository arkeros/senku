"StyleX design-token module: ts_project + StyleX Babel transpile, emits StylexInfo"

load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load(":labels.bzl", "is_node_module", "ts_dep")
load(":providers.bzl", "StylexInfo")
load(":stylex_transpile.bzl", "stylex_transpile")

_DEFAULT_TSCONFIG = "//:tsconfig"

def _stylex_library_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
    ]

_stylex_library_rule = rule(
    implementation = _stylex_library_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(allow_files = True, doc = ".stylex.json metadata files"),
        "deps": attr.label_list(doc = "Other StylexInfo-bearing targets (for transitive metadata)"),
    },
)

def stylex_library(name, srcs, deps = [], tsconfig = _DEFAULT_TSCONFIG, **kwargs):
    """Build a StyleX design-token module (e.g. `tokens.stylex.ts`).

    Produces a type-checked TS compilation plus StyleX Babel transpile, and
    exposes StylexInfo so downstream react_component/stylex_css targets can
    collect atomic CSS transitively.

    Produces:
      - :{name}           — public target, provides StylexInfo
      - :{name}_ts        — ts_project (internal, JS + .d.ts outputs)
      - :{name}_typecheck — tsc type-check (from ts_project)

    Args:
        name: target name
        srcs: .stylex.ts files
        deps: other stylex_library or react_component targets (transitive StylexInfo)
        tsconfig: tsconfig.json label
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """

    ts_deps = [ts_dep(d) for d in deps]

    ts_project(
        name = name + "_ts",
        srcs = srcs,
        declaration = True,
        source_map = True,
        transpiler = lambda **transpiler_kwargs: stylex_transpile(
            stylex_deps = ts_deps,
            **transpiler_kwargs
        ),
        tsconfig = tsconfig,
        deps = ts_deps + [
            "//:node_modules/@stylexjs/stylex",
        ],
        **kwargs
    )

    _stylex_library_rule(
        name = name,
        js_outs = [name + "_ts"],
        metadata = [name + "_ts_transpile_stylex_metadata"],
        deps = [d for d in deps if not is_node_module(d)],
        **{k: v for k, v in kwargs.items() if k == "visibility" or k == "tags"}
    )
