"React component macro with Babel + StyleX transpilation for Bazel"

load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load(":labels.bzl", "is_node_module", "ts_dep")
load(":react_library.bzl", "react_library")
load(":stylex_transpile.bzl", "stylex_transpile")

_DEFAULT_TSCONFIG = "//:tsconfig"

def react_component(name, srcs, deps = [], tsconfig = _DEFAULT_TSCONFIG, _export_test = True, **kwargs):
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
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """

    # Separate component deps from node_module deps
    component_deps = [d for d in deps if not is_node_module(d)]
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
            "//:node_modules/@types/react",
            "//:node_modules/react",
        ],
        **kwargs
    )

    # Use the target name as the canonical exported symbol name.
    # This keeps ReactComponentInfo aligned with the export test and
    # downstream code generation even when the source filename differs.
    entry_name = name

    # Wrap in react_library to carry StylexInfo + ReactComponentInfo
    react_library(
        name = name,
        js_outs = [name + "_ts"],
        metadata = [name + "_ts_transpile_stylex_metadata"],
        entry_name = entry_name,
        deps = component_deps,
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
            # Doubled braces ({{ }}) escape literal { } for str.format below;
            # single {} is the name substitution.
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

