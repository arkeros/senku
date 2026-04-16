"React component macro with Babel + StyleX transpilation for Bazel"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary", "js_test")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_lib//lib:copy_file.bzl", "copy_file")
load("@bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load(":react_library.bzl", "react_library")

_DEFAULT_BABEL_CONFIG = "//devtools/build/react_component:babel_config"
_DEFAULT_TSCONFIG = "//:tsconfig"

def _is_node_module(dep):
    """Check if a dep is a node_modules label."""
    return "node_modules" in dep

def _ts_dep(dep):
    """Map a component dep to its ts_project target name."""
    if _is_node_module(dep):
        return dep
    if dep.startswith("//"):
        # Cross-package: "//examples/stylex/pages:Home" -> "//examples/stylex/pages:Home_ts"
        if ":" in dep:
            return dep + "_ts"
        else:
            return dep + ":" + dep.split("/")[-1] + "_ts"
    # Same package: ":Button" -> ":Button_ts"
    return dep + "_ts"

def _lib_dep(dep):
    """Map a component dep to its react_library target (unchanged — it's the public name)."""
    return dep

def react_component(name, srcs, deps = [], tsconfig = _DEFAULT_TSCONFIG, babel_config = _DEFAULT_BABEL_CONFIG, _export_test = True, **kwargs):
    """Build a React component with TypeScript type-checking and StyleX CSS extraction.

    Wraps ts_project with the StyleX Babel transpiler and a react_library rule
    that carries StylexInfo and ReactComponentInfo providers.

    Produces the following targets:
      - :{name}              — react_library (public, carries providers)
      - :{name}_ts           — ts_project (internal, JS + .d.ts outputs)
      - :{name}_typecheck    — tsc type-check (from ts_project)
      - :{name}_export_test  — verifies named export matches target name

    Args:
        name: target name (must match the exported component name)
        srcs: .ts/.tsx source files
        deps: other react_component targets or node_modules labels
        tsconfig: tsconfig.json label (optional)
        babel_config: babel.config.json label
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """

    # Separate component deps from node_module deps
    component_deps = [d for d in deps if not _is_node_module(d)]
    ts_deps = [_ts_dep(d) for d in deps]

    ts_project(
        name = name + "_ts",
        srcs = srcs,
        declaration = True,
        source_map = True,
        transpiler = lambda **transpiler_kwargs: _stylex_transpiler(
            babel_config = babel_config,
            **transpiler_kwargs
        ),
        tsconfig = tsconfig,
        deps = ts_deps + [
            "//:node_modules/@stylexjs/stylex",
            "//:node_modules/@types/react",
            "//:node_modules/react",
        ],
        **kwargs
    )

    # Wrap in react_library to carry StylexInfo + ReactComponentInfo
    react_library(
        name = name,
        js_outs = [name + "_ts"],
        metadata = [name + "_ts_transpile_stylex_metadata"],
        entry_name = name,
        deps = [_lib_dep(d) for d in component_deps],
        **{k: v for k, v in kwargs.items() if k == "visibility" or k == "tags"}
    )

    if not _export_test:
        return

    # Verify the target name matches a named export in the compiled JS.
    # Uses static text analysis (no import) to avoid resolving dependencies.
    write_file(
        name = name + "_export_test_script",
        out = name + "_export_test.mjs",
        content = [
            'import { readFileSync } from "node:fs";',
            'import { test } from "node:test";',
            'import assert from "node:assert";',
            "",
            "const code = readFileSync(process.argv[2], 'utf-8');",
            'const exportRe = /export\\s+(?:function|class|const|let|var)\\s+{}/;'.format(name),
            'const reExportRe = /export\\s*\\{{[^}}]*\\b{}\\b[^}}]*\\}}/;'.format(name),
            "",
            'test("react_component {} exports {}", () => {{'.format(name, name),
            "  assert.ok(",
            "    exportRe.test(code) || reExportRe.test(code),",
            '    `react_component "{}" expects a named export "{}". Check that the target name matches the exported component name.`'.format(name, name),
            "  );",
            "});",
        ],
    )

    # Reference the specific .js file from ts_project output
    js_file = srcs[0].replace(".tsx", ".js").replace(".ts", ".js")
    js_test(
        name = name + "_export_test",
        args = ["$(location {})".format(js_file)],
        data = [js_file],
        entry_point = name + "_export_test.mjs",
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
