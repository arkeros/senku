"""Per-app i18n pipeline: merge per-component catalog fragments + emit typed TS manifest."""

load(
    ":_artifact_aspect.bzl",
    "I18nCatalogCollection",
    "I18nRefsCollection",
    "i18n_catalog_aspect",
    "i18n_refs_aspect",
)
load(":react_component.bzl", "react_component")

def _parse_locale_from_basename(basename):
    # Filenames are <component>.<locale>.mf2.json; Starlark has no regex so
    # we lean on the structured suffix convention.
    if not basename.endswith(".mf2.json"):
        fail("i18n fragment must end with .mf2.json: " + basename)
    stem = basename[:-len(".mf2.json")]  # <component>.<locale>
    dot = stem.rfind(".")
    if dot < 0:
        fail("i18n fragment filename must be <component>.<locale>.mf2.json, got: " + basename)
    return stem[dot + 1:]

def _i18n_bundle_impl(ctx):
    fragments = sorted(
        depset(transitive = [
            c[I18nCatalogCollection].files
            for c in ctx.attr.components
            if I18nCatalogCollection in c
        ]).to_list(),
        key = lambda f: f.path,
    )

    # Ref manifests come from components that declared i18n catalogs; every
    # such component's sources were scanned for <Trans id="..." /> call
    # sites, so the union here is "every id referenced by the app's
    # component closure" — exactly the set the merger validates against
    # the source-locale merged catalog.
    refs_files = depset(transitive = [
        c[I18nRefsCollection].files
        for c in ctx.attr.components
        if I18nRefsCollection in c
    ]).to_list()

    # Compose the merge-manifest the orchestrator tool consumes. Pairing
    # locale + path here avoids reparsing filenames JS-side and keeps locale
    # detection in one place.
    manifest_struct = struct(
        source_locale = ctx.attr.source_locale,
        locales = ctx.attr.locales,
        fragments = [
            struct(
                locale = _parse_locale_from_basename(f.basename),
                path = f.path,
            )
            for f in fragments
        ],
        refs_files = [f.path for f in refs_files],
    )
    merge_manifest = ctx.actions.declare_file(ctx.label.name + "_merge_manifest.json")
    ctx.actions.write(merge_manifest, json.encode(manifest_struct))

    merged_jsons = [
        ctx.actions.declare_file(ctx.label.name + "_" + locale + ".json")
        for locale in ctx.attr.locales
    ]
    # `out_ts` is an attr.output so the caller pre-declares the filename;
    # that makes the .ts file addressable as a regular file label within
    # the package, which ts_project can ingest as a src (same pattern
    # asset_codegen uses for its generated .ts module).
    manifest_ts = ctx.outputs.out_ts

    args = ctx.actions.args()
    args.add("--merge-manifest", merge_manifest.path)
    args.add("--out-dir", merged_jsons[0].dirname)
    args.add("--out-prefix", ctx.label.name + "_")
    args.add("--manifest-ts", manifest_ts.path)

    ctx.actions.run(
        inputs = fragments + refs_files + [merge_manifest],
        outputs = merged_jsons + [manifest_ts],
        executable = ctx.executable._tool,
        arguments = [args],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "I18nBundle",
        progress_message = "Merging %d i18n fragment(s) for %s" % (len(fragments), ctx.label),
    )

    return [
        DefaultInfo(files = depset([manifest_ts])),
        OutputGroupInfo(
            manifest_ts = depset([manifest_ts]),
            merged = depset(merged_jsons),
        ),
    ]

_i18n_bundle = rule(
    implementation = _i18n_bundle_impl,
    attrs = {
        "components": attr.label_list(
            aspects = [i18n_catalog_aspect, i18n_refs_aspect],
            doc = "react_component targets whose transitive i18n fragments + ref manifests are aggregated.",
        ),
        "source_locale": attr.string(mandatory = True),
        "locales": attr.string_list(mandatory = True),
        "out_ts": attr.output(
            mandatory = True,
            doc = "Generated TS manifest filename (e.g. `app_i18n_manifest.ts`).",
        ),
        "_tool": attr.label(
            default = "//devtools/build/react_component:i18n_bundle_bin",
            executable = True,
            cfg = "exec",
        ),
    },
)

def i18n_artifacts(name, components, source_locale, locales, forward_kwargs = {}):
    """Produce an app-level i18n TS manifest from transitive component fragments.

    Merges per-component MF2 fragments for every declared locale, enforces
    coverage invariants at build time, and wraps the generated TS manifest in
    a `react_component` so app code can `import { I18N_CATALOGS, Locale }`
    from it.

    Args:
        name: parent react_app name; the manifest component is `{name}_i18n_manifest`.
        components: list of labels (layout + routes + error components) to walk.
        source_locale: the authoritative locale (other locales must match its key set).
        locales: list of locales to produce; must include source_locale.
        forward_kwargs: subset of react_app kwargs (visibility, tags, testonly).

    Produces:
        :{name}_i18n_bundle — DefaultInfo holds the TS manifest; OutputGroupInfo
            also exposes the per-locale merged JSONs under `merged`.
        :{name}_i18n_manifest — react_component wrapping the TS manifest for
            import as a normal TS dep. Not export-tested because the file
            has multiple named exports (I18N_CATALOGS, Locale).
    """
    if source_locale not in locales:
        fail("i18n_artifacts: source_locale %r must appear in locales %r" % (source_locale, locales))

    component_kwargs = dict(forward_kwargs)
    if "visibility" not in component_kwargs:
        component_kwargs["visibility"] = ["//visibility:public"]

    bundle_name = name + "_i18n_bundle"
    manifest_ts = name + "_i18n_manifest.ts"
    _i18n_bundle(
        name = bundle_name,
        components = components,
        source_locale = source_locale,
        locales = locales,
        out_ts = manifest_ts,
        **forward_kwargs
    )

    react_component(
        name = name + "_i18n_manifest",
        srcs = [manifest_ts],
        _export_test = False,
        deps = [
            "//:node_modules/@panellet/i18n-runtime",
        ],
        **component_kwargs
    )
