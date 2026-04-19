"React component macro with Babel + StyleX transpilation for Bazel"

load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load(":_artifact_outputs.bzl", "artifact_outputs")
load(":_hash_assets.bzl", "hash_assets")
load(":asset_codegen.bzl", "asset_codegen")
load(":labels.bzl", "is_node_module", "ts_dep")
load(":stylex_transpile.bzl", "stylex_transpile")

_DEFAULT_TSCONFIG = "//:tsconfig"

def react_component(name, srcs, deps = [], assets = [], i18n = [], tsconfig = _DEFAULT_TSCONFIG, _export_test = True, **kwargs):
    """Build a React component with TypeScript type-checking and StyleX CSS extraction.

    Wraps ts_project with the StyleX Babel transpiler and a thin rule that
    exposes build-time metadata via named OutputGroups (collected transitively
    by aspects in _artifact_aspect.bzl). The public target's DefaultInfo
    surfaces the ts_project outputs (including `{name}.js`), which
    react_app_manifest looks up by naming convention — no routing-specific
    provider required.

    When `assets` is non-empty, the macro content-hashes each file, emits a
    `<name>.assets.ts` typed-consts module colocated with the source, and
    includes it in the ts_project srcs. Import the generated URLs with
    `import { logoUrl } from "./<Component>.assets"`.

    Produces the following targets:
      - :{name}              — public target (DefaultInfo + OutputGroupInfo.stylex_metadata / assets)
      - :{name}_ts           — ts_project (internal, JS + .d.ts outputs)
      - :{name}_typecheck    — tsc type-check (from ts_project)
      - :{name}_export_test  — verifies named export matches target name
      - :{name}_assets       — hash_assets (when `assets` is non-empty)
      - :{name}_assets_ts    — asset_codegen (when `assets` is non-empty)

    Args:
        name: target name (must match the exported component name and the JS entry)
        srcs: .ts/.tsx source files
        deps: other react_component targets or node_modules labels
        assets: static asset files (svg, png, woff2, etc.) to content-hash and
            expose as typed URL consts in `<name>.assets.ts`
        i18n: MF2 catalog fragments, one per locale. Filenames must follow
            `<anything>.<locale>.mf2.json`. Exposed via the `i18n_catalog`
            OutputGroup; react_app's `i18n_catalog_aspect` aggregates them
            across deps and merges per locale.
        tsconfig: tsconfig.json label (optional)
        **kwargs: passed through to ts_project (e.g. visibility, tags)
    """

    # Separate component deps from node_module deps
    component_deps = [d for d in deps if not is_node_module(d)]
    ts_deps = [ts_dep(d) for d in deps]

    # Forwarded attrs that also make sense on the asset sub-targets
    _forward_kwargs = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}

    all_srcs = list(srcs)
    if assets:
        hash_assets(
            name = name + "_assets",
            srcs = assets,
            **_forward_kwargs
        )
        asset_codegen(
            name = name + "_assets_ts",
            hashed = ":" + name + "_assets",
            out = name + ".assets.ts",
            **_forward_kwargs
        )
        all_srcs.append(name + ".assets.ts")

    ts_project(
        name = name + "_ts",
        srcs = all_srcs,
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

    # Thin wrapper that re-exposes ts_project outputs and the stylex_metadata
    # output group. Downstream consumers (react_app_manifest) read files from
    # DefaultInfo by naming convention; stylex_css reaches the metadata
    # through the stylex_metadata_aspect traversing `deps`.
    artifact_outputs(
        name = name,
        js_outs = [name + "_ts"],
        metadata = [name + "_ts_transpile_stylex_metadata"],
        i18n = i18n,
        deps = component_deps + ([":" + name + "_assets"] if assets else []),
        **{k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}
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

