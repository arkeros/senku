"StyleX design-token module: ts_project + StyleX Babel transpile, exposes stylex_metadata OutputGroup"

load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load(":_artifact_outputs.bzl", "artifact_outputs")
load(":labels.bzl", "is_node_module", "ts_dep")
load(":stylex_transpile.bzl", "stylex_transpile")

_DEFAULT_TSCONFIG = "//:tsconfig"

def stylex_library(name, srcs, deps = [], tsconfig = _DEFAULT_TSCONFIG, **kwargs):
    """Build a StyleX design-token module (e.g. `tokens.stylex.ts`).

    Produces a type-checked TS compilation plus StyleX Babel transpile, and
    exposes its `.stylex.json` metadata via OutputGroupInfo so downstream
    react_component / stylex_css targets can collect atomic CSS transitively
    through the stylex_metadata_aspect.

    Produces:
      - :{name}           — public target, DefaultInfo + OutputGroupInfo.stylex_metadata
      - :{name}_ts        — ts_project (internal, JS + .d.ts outputs)
      - :{name}_typecheck — tsc type-check (from ts_project)

    Args:
        name: target name
        srcs: .stylex.ts files
        deps: other stylex_library or react_component targets (traversed by aspect)
        tsconfig: tsconfig.json label. Defaults to `//:tsconfig` in the
            *consuming* repo — each consumer is expected to provide a
            `ts_config(name = "tsconfig", src = "tsconfig.json")` at its root.
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """

    ts_deps = [ts_dep(d) for d in deps]

    ts_project(
        name = name + "_ts",
        srcs = srcs,
        declaration = True,
        source_map = True,
        resolve_json_module = True,
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

    artifact_outputs(
        name = name,
        js_outs = [name + "_ts"],
        metadata = [name + "_ts_transpile_stylex_metadata"],
        deps = [d for d in deps if not is_node_module(d)],
        **{k: v for k, v in kwargs.items() if k == "visibility" or k == "tags"}
    )
