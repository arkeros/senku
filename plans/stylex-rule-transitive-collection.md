# Transitive StyleX CSS collection via a Bazel rule

## Problem

`stylex_css` is a macro that requires an explicit flat list of components.
Transitive deps like `Button` (used by `Home`) are missed unless manually listed.

## Solution

Convert `react_component` to produce a custom provider (`StylexInfo`) carrying
its `.stylex.json` metadata files. Convert `stylex_css` to a rule that walks
`deps` transitively via the provider's depset. No aspect needed.

## Design

### Provider

```python
StylexInfo = provider(
    doc = "Carries StyleX CSS metadata files through the dependency graph",
    fields = {
        "metadata": "depset of .stylex.json Files",
    },
)
```

### react_component changes

Currently `react_component` is a macro that calls `ts_project` + `_stylex_transpiler`.
The transpiler creates filegroups for JS outputs and metadata.

Change: add a thin wrapper rule (`stylex_library`) that:
1. Takes the JS outputs from `ts_project` (passes them through as default outputs)
2. Takes the `.stylex.json` files from the transpiler
3. Collects `StylexInfo` from `deps` transitively
4. Returns `StylexInfo` with a depset merging own metadata + transitive metadata

```python
def _stylex_library_impl(ctx):
    own_metadata = ctx.files.metadata
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    return [
        DefaultInfo(files = depset(ctx.files.srcs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
    ]

stylex_library = rule(
    implementation = _stylex_library_impl,
    attrs = {
        "srcs": attr.label_list(allow_files = True),
        "metadata": attr.label_list(allow_files = [".json"]),
        "deps": attr.label_list(providers = [[StylexInfo]]),
    },
)
```

The `react_component` macro wraps everything:

```python
def react_component(name, srcs, deps = [], ...):
    # 1. Transpile (existing _stylex_transpiler) → JS + metadata
    ts_project(
        name = name + "_ts",
        transpiler = ...,
        deps = [d + "_ts" for d in local_deps] + node_module_deps,
    )

    # 2. Wrap in stylex_library to carry StylexInfo
    stylex_library(
        name = name,
        srcs = [name + "_ts"],  # pass through JS outputs
        metadata = [name + "_transpile_stylex_metadata"],
        deps = deps,  # these carry StylexInfo transitively
    )
```

### stylex_css changes

Convert from macro to rule. The rule:
1. Accepts `components` as `attr.label_list`
2. Reads `StylexInfo` from each component (already contains transitive metadata)
3. Merges all depsets
4. Passes the merged `.stylex.json` files to `stylex_collect_css.mjs`

```python
def _stylex_css_impl(ctx):
    all_metadata = []
    for comp in ctx.attr.components:
        if StylexInfo in comp:
            all_metadata.append(comp[StylexInfo].metadata)

    metadata_files = depset(transitive = all_metadata).to_list()

    # Run stylex_collect_css.mjs with the metadata files
    output = ctx.actions.declare_file(ctx.attr.output)
    ctx.actions.run(
        inputs = metadata_files + [ctx.executable._tool],
        outputs = [output],
        executable = ctx.executable._tool,
        arguments = ["--output", output.path] + [f.path for f in metadata_files],
    )

    return [DefaultInfo(files = depset([output]))]

stylex_css = rule(
    implementation = _stylex_css_impl,
    attrs = {
        "components": attr.label_list(providers = [[StylexInfo]]),
        "output": attr.string(),
        "_tool": attr.label(
            default = "//devtools/build/react_component:stylex_collect_css_bin",
            executable = True,
            cfg = "exec",
        ),
    },
)
```

### Dependency graph example

```
react_app
  └── stylex_css(components = [":Layout", "//pages:Home", "//pages:About"])
        │
        ├── :Layout [StylexInfo: {Layout.stylex.json}]
        ├── //pages:Home [StylexInfo: {Home.stylex.json, Button.stylex.json}]
        │     └── :Button [StylexInfo: {Button.stylex.json}]  ← transitive!
        └── //pages:About [StylexInfo: {About.stylex.json}]
```

`stylex_css` gets Home's `StylexInfo` which already includes Button's metadata
via the depset. No need to list Button explicitly.

## Files to create/modify

### New

- `devtools/build/react_component/stylex_info.bzl` — `StylexInfo` provider + `stylex_library` rule

### Modify

- `devtools/build/react_component/react_component.bzl` — wrap `ts_project` output in `stylex_library`
- `devtools/build/react_component/stylex_css.bzl` — convert from macro to rule
- `devtools/build/react_component/react_app.bzl` — remove `components` param
- `examples/stylex/BUILD` — remove `components = [":Button"]`

### Unchanged

- `devtools/build/react_component/stylex_transpile.mjs` — still produces `.stylex.json`
- `devtools/build/react_component/stylex_collect_css.mjs` — still merges metadata → CSS
- `devtools/build/js/*` — unaffected

## Migration

The `stylex_library` wrapper is added inside `react_component` macro — external API
unchanged. The `stylex_css` rule accepts the same `components` list but now
automatically includes transitive deps.

The `react_app` `components` parameter becomes unnecessary and can be removed.

## Future: inline provider into the transpiler

The `stylex_library` wrapper exists only to carry `StylexInfo`. Ideally the
transpiler itself would be a rule (not a macro calling `js_run_binary`) that
returns `StylexInfo` directly — the `.stylex.json` files are already produced,
they just need to be propagated via a provider instead of a filegroup.

This eliminates the extra target per component but requires converting
`_stylex_transpiler` from a macro to a rule with a custom implementation that:
1. Runs Babel via `ctx.actions.run`
2. Returns `DefaultInfo` (JS outputs) + `StylexInfo` (metadata depset)
3. Collects `StylexInfo` from `deps` transitively

That's a larger rewrite — defer until the wrapper proves to be a maintenance
burden or performance bottleneck.

## Note: over-collection of CSS

The depset approach collects metadata from the entire transitive dep tree,
including components behind code-split routes that may not load on the initial
page. This is fine for now — StyleX atomic CSS deduplicates naturally
(each class like `.x1j61zf2{font-size:16px}` appears once regardless of how
many components use it), and unused classes cost negligible bytes.

Flag for later if per-route CSS splitting becomes a requirement.

## Verification

```bash
# Button styles should appear without listing it explicitly
bazel build //examples/stylex:app_styles
grep "cursor" bazel-bin/examples/stylex/app_styles.css  # Button's cursor:pointer

# Full test
bazel test //examples/stylex:stylex_test
bazel run //examples/stylex:app_devserver
```
