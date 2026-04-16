# Transitive StyleX CSS collection via Bazel aspect

## Problem

`stylex_css` currently requires an explicit list of components. Non-route components
like `Button` are missed unless manually added via `components = [":Button"]`.
This doesn't scale — every shared component needs to be listed, and forgetting one
means silently missing styles.

## Goal

`stylex_css` should automatically collect `.stylex.json` metadata from the entire
transitive dependency tree. If `Home` depends on `Button`, Button's styles are
included automatically.

## Approach: Bazel aspect with a custom provider

### 1. Define a `StylexInfo` provider

```python
StylexInfo = provider(
    fields = {
        "metadata": "depset of .stylex.json files",
    },
)
```

### 2. Convert `react_component` from macro to rule

Currently `react_component` is a macro wrapping `ts_project`. To attach a provider,
it needs to be a rule (or at minimum, the internal transpiler needs to produce a
target that carries `StylexInfo`).

Option A: **Full rule** — replace the macro with a custom rule that wraps `ts_project`
internally and returns `StylexInfo` alongside the default outputs.

Option B: **Aspect** — write an aspect that, when applied to any target, looks for
`_transpile_stylex_metadata` filegroups in the target and its transitive deps, and
collects them into a depset. `stylex_css` applies this aspect to its deps.

Option B is less invasive — the `react_component` macro stays unchanged.

### 3. Write the `stylex_metadata_aspect`

```python
StylexMetadataInfo = provider(fields = {"metadata": "depset of Files"})

def _stylex_metadata_aspect_impl(target, ctx):
    metadata = []

    # Check if this target has a _transpile_stylex_metadata sibling
    # (created by react_component macro)
    metadata_target_name = target.label.name + "_transpile_stylex_metadata"
    # ... look up the filegroup's files

    # Collect from deps transitively
    transitive = []
    if hasattr(ctx.rule.attr, "deps"):
        for dep in ctx.rule.attr.deps:
            if StylexMetadataInfo in dep:
                transitive.append(dep[StylexMetadataInfo].metadata)

    return [StylexMetadataInfo(
        metadata = depset(metadata, transitive = transitive),
    )]

stylex_metadata_aspect = aspect(
    implementation = _stylex_metadata_aspect_impl,
    attr_aspects = ["deps"],
)
```

### 4. Challenge: aspect can't resolve sibling targets

The aspect visits `//examples/stylex/pages:Home` and needs to find
`//examples/stylex/pages:Home_transpile_stylex_metadata`. But aspects can't
query for arbitrary targets — they only see the target they're applied to and
its declared deps.

**Workaround**: instead of creating a separate `_stylex_metadata` filegroup in
the `react_component` macro, have the transpiler output the `.stylex.json` files
as part of the target's default outputs (or a dedicated output group). Then the
aspect can collect them directly from the target's files.

### 5. Implementation plan

#### Step 1: Add output group to `_stylex_transpiler`

In `react_component.bzl`, instead of creating a separate `_stylex_metadata`
filegroup, add the metadata files to an **output group** on the main filegroup:

```python
native.filegroup(
    name = name,
    srcs = outs,
)

# Instead of a separate filegroup, use OutputGroupInfo (requires a rule, not macro)
```

Problem: `native.filegroup` can't carry custom output groups. This is macro territory.

#### Step 2: Create a thin wrapper rule

Create a `stylex_metadata_collector` rule that:
- Takes a list of component targets as deps
- Applies the `stylex_metadata_aspect` to collect `.stylex.json` transitively
- Outputs a merged CSS file via `processStylexRules`

```python
stylex_css = rule(
    implementation = _stylex_css_impl,
    attrs = {
        "components": attr.label_list(aspects = [stylex_metadata_aspect]),
        ...
    },
)
```

#### Step 3: Tag metadata files

The aspect needs to identify `.stylex.json` files among a target's outputs.
Convention: all `.stylex.json` files in a target's default outputs are StyleX
metadata.

#### Step 4: Walk deps transitively

The aspect walks `deps` and collects all `.stylex.json` files into a depset.
The `stylex_css` rule merges the depset and passes it to the collector script.

### 6. Files to modify

- `devtools/build/react_component/stylex_css.bzl` — convert from macro to rule with aspect
- `devtools/build/react_component/react_component.bzl` — ensure `.stylex.json` files are discoverable
- `devtools/build/react_component/react_app.bzl` — remove `components` param, just pass route components to `stylex_css` and let the aspect handle transitive collection
- New: `devtools/build/react_component/stylex_aspect.bzl` — the aspect + provider

### 7. User-facing change

Before:
```python
react_app(
    name = "app",
    components = [":Button"],  # manual, error-prone
    ...
)
```

After:
```python
react_app(
    name = "app",
    # no components needed — Button's styles collected automatically
    # through Home -> Button dep chain
    ...
)
```

### 8. Risks

- Aspects add complexity to the build graph — harder to debug
- The aspect needs to handle non-react_component targets gracefully (skip them)
- Output group approach requires converting at least part of `react_component` to a rule
- The `.stylex.json` files need to be in the target's default outputs or an output group,
  not a separate filegroup (aspects can't see sibling targets)

### 9. Alternative: simpler convention-based approach

Instead of a full aspect, keep the current macro approach but have `stylex_css`
accept component labels and automatically resolve `<label>_transpile_stylex_metadata`
for the label AND all its transitive `deps`. This requires `stylex_css` to read
the dep graph at analysis time, which only a rule (not macro) can do.

This is essentially the same as the aspect approach but without the explicit aspect
declaration — the rule does the dep walking internally.
