"""Shared asset bundle: content-hash a set of files and expose them as a typed TS module.

Use `asset_library` when multiple components depend on the same pack of
assets — an icon set, a font family, a sprite sheet. For per-component
assets colocated with one component, use `react_component`'s `assets`
attr instead (simpler, less ceremony).

    asset_library(
        name = "icons",
        srcs = glob(["icons/*.svg"]),
        visibility = ["//my_app:__subpackages__"],
    )

    # in any consuming component:
    import { trashUrl, saveUrl } from "//my_app:icons";

The target's DefaultInfo surfaces the generated `<name>.ts`, which
`ts_project` (via react_component's `deps`) compiles as a normal TS
module. The hashed files + manifest flow up through the `assets` and
`asset_manifest` output groups for aspect collection.
"""

load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load(":_artifact_outputs.bzl", "artifact_outputs")
load(":_hash_assets.bzl", "hash_assets")
load(":asset_codegen.bzl", "asset_codegen")

_DEFAULT_TSCONFIG = "//:tsconfig"

def asset_library(name, srcs, tsconfig = _DEFAULT_TSCONFIG, url_prefix = "/assets/", **kwargs):
    """Build a reusable asset bundle exposed as a typed TS module.

    Mirrors the react_component / stylex_library shape: `:{name}_ts` is the
    ts_project, `:{name}` is the public wrapper. Consumers depend on
    `:{name}` in `react_component.deps`; `ts_dep` maps it to the `_ts`
    target just like any other component.

    Produces:
      - :{name}            — public target (artifact_outputs; propagates hash_assets via deps)
      - :{name}_hashed     — hash_assets (tree + manifest; exposes OutputGroupInfo.assets/asset_manifest)
      - :{name}_codegen    — generates {name}.ts with typed URL consts
      - :{name}_ts         — ts_project of the generated module
      - :{name}_typecheck  — tsc type-check (from ts_project)

    Args:
        name: target name (also the TS module name consumers import)
        srcs: asset files to content-hash. Basenames must be unique.
        tsconfig: tsconfig.json label (defaults to repo root).
        url_prefix: URL path prefix for the generated const values.
        **kwargs: passed through to sub-targets (visibility, tags, testonly).
    """
    _forward = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}

    hash_assets(
        name = name + "_hashed",
        srcs = srcs,
        **_forward
    )

    asset_codegen(
        name = name + "_codegen",
        hashed = ":" + name + "_hashed",
        out = name + ".ts",
        url_prefix = url_prefix,
        **_forward
    )

    # Compile the generated TS so consumers get a real module to import
    # with .d.ts types. Use tsc as the transpiler — generated exports are
    # plain string consts (no StyleX, no React), so no Babel pass needed.
    ts_project(
        name = name + "_ts",
        srcs = [name + ".ts"],
        declaration = True,
        source_map = True,
        transpiler = "tsc",
        tsconfig = tsconfig,
        **_forward
    )

    # Public wrapper. `deps = [:_hashed]` makes the asset_* aspects walk
    # into the hash_assets target and pick up the tree + manifest when
    # collecting transitively from a downstream app.
    artifact_outputs(
        name = name,
        js_outs = [name + "_ts"],
        deps = [":" + name + "_hashed"],
        **_forward
    )
