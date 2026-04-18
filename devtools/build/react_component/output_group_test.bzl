"""Test helper: assert a target exposes a named OutputGroup at analysis time.

Used to lock in the OutputGroupInfo contract that the asset + StyleX
pipelines depend on. A target without the expected group fails analysis
with a clear message — surfaces regressions in the rules that produce
those groups without requiring a full build to finish.
"""

load("@bazel_skylib//rules:build_test.bzl", "build_test")

def _require_output_group_impl(ctx):
    target = ctx.attr.target
    group = ctx.attr.group

    if OutputGroupInfo not in target:
        fail("{} does not expose OutputGroupInfo (expected group '{}')".format(
            target.label,
            group,
        ))
    og = target[OutputGroupInfo]
    if not hasattr(og, group):
        fail("{} OutputGroupInfo has no group '{}'".format(target.label, group))

    files = getattr(og, group).to_list()
    if ctx.attr.non_empty and not files:
        fail("{} output group '{}' is empty".format(target.label, group))

    # Emit a marker file so build_test has something to depend on.
    marker = ctx.actions.declare_file(ctx.label.name + ".ok")
    ctx.actions.write(marker, "\n".join([f.short_path for f in files]) + "\n")
    return [DefaultInfo(files = depset([marker]))]

_require_output_group = rule(
    implementation = _require_output_group_impl,
    attrs = {
        "target": attr.label(mandatory = True),
        "group": attr.string(mandatory = True),
        "non_empty": attr.bool(default = True),
    },
)

def require_output_group_test(name, target, group, non_empty = True, **kwargs):
    """Analysis-time assertion that `target` exposes `OutputGroupInfo.<group>`.

    Args:
        name: test target name
        target: label of the target under test
        group: expected OutputGroupInfo field name (e.g. "stylex_metadata")
        non_empty: if True, also require at least one file in the group
        **kwargs: forwarded to build_test (e.g. tags)
    """
    check = name + "_check"
    _require_output_group(
        name = check,
        target = target,
        group = group,
        non_empty = non_empty,
        testonly = True,
    )
    build_test(
        name = name,
        targets = [":" + check],
        **kwargs
    )
