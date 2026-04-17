"Internal rule: expose ts_project JS outputs and propagate StylexInfo transitively."

# DESIGN NOTE — generalization path.
#
# This rule + StylexInfo are StyleX-specific today. If a second
# build-time-metadata transform lands (CSS Modules static extraction,
# Compiled, Panda, i18n string extraction, etc.), do NOT add a
# parallel FooInfo + wrapper rule alongside this one. The shape is
# identical: per-target file produced by transpile, aggregated
# transitively along deps, consumed by a downstream collector —
# copy-pasting it locks the duplication in.
#
# Two generalizations fit:
#   a) Rename to TranspilerMetadataInfo with a `kind` tag field; one
#      wrapper rule per transpiler, one provider total.
#   b) Drop the wrapper rule: emit a named output group from each
#      transpile action and walk deps via an aspect.
#
# (a) is simpler if collectors are 1:1 with metadata kinds. (b) is
# right if one collector wants to merge several kinds. Pick when the
# second real caller exists — rule-of-three applies to frameworks as
# much as to functions, and pre-extracting an abstraction for a
# speculative second user almost always produces one that fits the
# first user and bends awkwardly for the second.

load(":providers.bzl", "StylexInfo")

def _stylex_outputs_impl(ctx):
    own_metadata = [f for f in ctx.files.metadata if f.path.endswith(".stylex.json")]
    transitive = [dep[StylexInfo].metadata for dep in ctx.attr.deps if StylexInfo in dep]

    return [
        DefaultInfo(files = depset(ctx.files.js_outs)),
        StylexInfo(metadata = depset(own_metadata, transitive = transitive)),
    ]

stylex_outputs = rule(
    implementation = _stylex_outputs_impl,
    attrs = {
        "js_outs": attr.label_list(allow_files = True, doc = "JS outputs from ts_project"),
        "metadata": attr.label_list(allow_files = True, doc = ".stylex.json metadata files"),
        "deps": attr.label_list(doc = "Other StylexInfo-bearing targets (for transitive metadata)"),
    },
)
