"React component macro with Babel + StyleX transpilation for Bazel"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_lib//lib:copy_file.bzl", "copy_file")
load("@bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")

_DEFAULT_BABEL_CONFIG = "//devtools/build/react_component:babel_config"
_DEFAULT_TSCONFIG = "//:tsconfig"

def react_component(name, srcs, deps = [], tsconfig = _DEFAULT_TSCONFIG, babel_config = _DEFAULT_BABEL_CONFIG, **kwargs):
    """Build a React component with TypeScript type-checking and StyleX CSS extraction.

    Wraps ts_project with the StyleX Babel transpiler. Each source file is
    compiled in a single Babel pass producing .js + .js.map + .stylex.json,
    while tsc runs in parallel for type-checking and .d.ts generation.

    Produces the following targets:
      - :{name}              — JS outputs (default)
      - :{name}_typecheck    — tsc type-check
      - :{name}_transpile_stylex_metadata — .stylex.json files for stylex_css()

    Args:
        name: target name
        srcs: .ts/.tsx source files
        deps: ts_project deps (other components, node_modules)
        tsconfig: tsconfig.json label (optional)
        babel_config: babel.config.json label (defaults to //devtools/build/react_component:babel_config)
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """
    ts_project(
        name = name,
        srcs = srcs,
        declaration = True,
        source_map = True,
        transpiler = lambda **transpiler_kwargs: _stylex_transpiler(
            babel_config = babel_config,
            **transpiler_kwargs
        ),
        tsconfig = tsconfig,
        deps = deps + [
            "//:node_modules/@stylexjs/stylex",
            "//:node_modules/@types/react",
            "//:node_modules/react",
        ],
        **kwargs
    )

def _stylex_transpiler(name, srcs, out_dir = None, resolve_json = False, babel_config = _DEFAULT_BABEL_CONFIG, **kwargs):
    """Internal transpiler adapter for ts_project. Do not use directly."""
    outs = []
    metadata_outs = []

    for idx, src in enumerate(srcs):
        # Copy JSON files through without transpilation
        if resolve_json and src.endswith(".json"):
            if out_dir:
                copy_file(
                    name = "{}_{}".format(name, idx),
                    src = src,
                    out = "%s/%s" % (out_dir, src),
                )
            else:
                copy_to_bin(
                    name = "{}_{}".format(name, idx),
                    srcs = [src],
                )
            outs.append(":{}_{}".format(name, idx))
            continue

        # Skip declaration files — tsc handles those
        if src.endswith(".d.ts") or src.endswith(".d.mts"):
            continue

        if not (src.endswith(".ts") or src.endswith(".tsx") or src.endswith(".mts")):
            fail("react_component transpiler supports .[m]ts, .tsx, or .json files, found: %s" % src)

        out_pre = "%s/" % out_dir if out_dir else ""

        # Predict output paths
        js_out = out_pre + src.replace(".mts", ".mjs").replace(".tsx", ".js").replace(".ts", ".js")
        map_out = js_out + ".map"
        metadata_out = out_pre + src.replace(".mts", ".mjs.stylex.json").replace(".tsx", ".stylex.json").replace(".ts", ".stylex.json")

        args = [
            "$(location {})".format(src),
            "--out-file",
            "$(location {})".format(js_out),
            "--metadata-file",
            "$(location {})".format(metadata_out),
        ]

        tool_srcs = [
            src,
            "//:node_modules/@babel/core",
            "//:node_modules/@babel/preset-typescript",
            "//:node_modules/@babel/preset-react",
            "//:node_modules/@stylexjs/babel-plugin",
        ]

        if babel_config:
            args.extend(["--config-file", "$(location {})".format(babel_config)])
            tool_srcs.append(babel_config)

        js_run_binary(
            name = "{}_{}".format(name, idx),
            srcs = tool_srcs,
            outs = [js_out, map_out, metadata_out],
            args = args,
            tool = "//devtools/build/react_component:stylex_transpile_bin",
            **kwargs
        )

        outs.append(js_out)
        outs.append(map_out)
        metadata_outs.append(metadata_out)

    # The filegroup that ts_project() references for JS outputs
    native.filegroup(
        name = name,
        srcs = outs,
    )

    # Metadata filegroup for CSS collection
    native.filegroup(
        name = name + "_stylex_metadata",
        srcs = metadata_outs,
    )
