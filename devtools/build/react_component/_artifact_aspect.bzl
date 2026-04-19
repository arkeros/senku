"""Generic output-group aspect factory for transitive build-artifact collection.

One aspect per named OutputGroup. Consumers (stylex_css, asset_pipeline,
etc.) attach the aspect to a label_list attr and read the aggregated
depset off each visited target via the paired provider.

Design: per the note in _stylex_outputs.bzl, the rule-of-three tipping
point for generalizing StylexInfo was the static-assets caller (#95).
This module is path (b): each leaf exposes its contribution via
OutputGroupInfo(<group>=...); the aspect walks `deps` and merges the
contributions into a single depset.

Each aspect instance owns a distinct provider — two aspects that walked
the same target would otherwise collide on the provider.

Bazel requires `aspect()` calls to be top-level expressions, so each
aspect is declared explicitly below. The shared `_make_collect_impl`
helper supplies the body; only the `group` name and target provider
vary per aspect.

Usage:

    load(":_artifact_aspect.bzl", "stylex_metadata_aspect", "StylexMetadataCollection")

    my_rule = rule(
        attrs = {
            "components": attr.label_list(aspects = [stylex_metadata_aspect]),
        },
    )
    # in impl:
    files = depset(transitive = [
        c[StylexMetadataCollection].files
        for c in ctx.attr.components
        if StylexMetadataCollection in c
    ])
"""

StylexMetadataCollection = provider(
    doc = "Files collected from the 'stylex_metadata' output group across deps.",
    fields = {"files": "depset of File"},
)

AssetsCollection = provider(
    doc = "Hashed asset tree artifacts collected from the 'assets' output group across deps.",
    fields = {"files": "depset of File"},
)

AssetManifestCollection = provider(
    doc = "Per-leaf manifest files collected from the 'asset_manifest' output group across deps.",
    fields = {"files": "depset of File"},
)

I18nCatalogCollection = provider(
    doc = "Per-component MF2 catalog fragments collected from the 'i18n_catalog' output group across deps. Files are named <component>.<locale>.mf2.json; locale is parsed from the filename downstream.",
    fields = {"files": "depset of File"},
)

def _make_collect_impl(group, provider_obj):
    """Build an aspect implementation for the given OutputGroup name."""

    def _impl(target, ctx):
        own = []
        if OutputGroupInfo in target:
            og = target[OutputGroupInfo]
            if hasattr(og, group):
                own = getattr(og, group).to_list()

        transitive = []
        if hasattr(ctx.rule.attr, "deps"):
            for dep in ctx.rule.attr.deps:
                if provider_obj in dep:
                    transitive.append(dep[provider_obj].files)

        return [provider_obj(files = depset(own, transitive = transitive))]

    return _impl

_stylex_metadata_impl = _make_collect_impl("stylex_metadata", StylexMetadataCollection)

stylex_metadata_aspect = aspect(
    implementation = _stylex_metadata_impl,
    attr_aspects = ["deps"],
)

_assets_impl = _make_collect_impl("assets", AssetsCollection)

assets_aspect = aspect(
    implementation = _assets_impl,
    attr_aspects = ["deps"],
)

_asset_manifest_impl = _make_collect_impl("asset_manifest", AssetManifestCollection)

asset_manifest_aspect = aspect(
    implementation = _asset_manifest_impl,
    attr_aspects = ["deps"],
)

_i18n_catalog_impl = _make_collect_impl("i18n_catalog", I18nCatalogCollection)

i18n_catalog_aspect = aspect(
    implementation = _i18n_catalog_impl,
    attr_aspects = ["deps"],
)
