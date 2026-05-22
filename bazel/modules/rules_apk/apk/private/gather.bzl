"""Aspect: collects every ApkFragmentInfo reachable from a target.

Same shape as rules_rpm's gather_rpm_headers. The aspect walks the
target's deps (only the attributes most likely to carry per-package
spokes: `tars`, `srcs`, `deps`) and rolls every ApkFragmentInfo into
one depset, exposed via TransitiveApkFragmentInfo on the root.

This lets apkdb_merge declare a single input — the image-layer
composition target — and recover every installed-fragment without the
consumer having to enumerate per-package spokes by hand.
"""

load(":providers.bzl", "ApkFragmentInfo", "TransitiveApkFragmentInfo")

_TRAVERSE_ATTRS = ["tars", "srcs", "deps"]

def _gather_apk_fragments_impl(target, ctx):
    direct = []
    if ApkFragmentInfo in target:
        direct.append(target[ApkFragmentInfo])
    transitive = []
    for attr_name in _TRAVERSE_ATTRS:
        if not hasattr(ctx.rule.attr, attr_name):
            continue
        for dep in getattr(ctx.rule.attr, attr_name):
            if type(dep) != "Target":
                continue
            if TransitiveApkFragmentInfo in dep:
                transitive.append(dep[TransitiveApkFragmentInfo].fragments)
    return [TransitiveApkFragmentInfo(
        fragments = depset(direct, transitive = transitive),
    )]

gather_apk_fragments = aspect(
    implementation = _gather_apk_fragments_impl,
    attr_aspects = _TRAVERSE_ATTRS,
    doc = "Collects ApkFragmentInfo from every apk_package reachable through tars/srcs/deps.",
)
