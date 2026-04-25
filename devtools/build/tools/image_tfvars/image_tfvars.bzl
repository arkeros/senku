"""image_tfvars: emit a Terraform `auto.tfvars.json` pinning an `image_push`
target's built image as a full, digest-qualified URI.

Intended for Bazel-built images consumed by Terraform-managed Cloud Run / GKE
services. When `out_file` is given, the JSON is also materialized into the
source tree (gitignore it there, since it rotates on every image build) — the
target `name` becomes the runnable update step, matching bifrost's
`checked_in` convention.

The value written is the full `<registry>/<repository>@<digest>` URI, not
just the digest — so consumers don't need to hardcode the registry hostname
or repository layout in their Terraform. Swapping registries in the future
means changing the `image_push` target, not every downstream root.
"""

load("@bazel_lib//lib:write_source_files.bzl", "write_source_file")
load("@jq.bzl//jq:jq.bzl", "jq")
load("@rules_img//img/private/providers:deploy_info.bzl", "DeployInfo")

# jq program: read the deploy manifest, assemble `<registry>/<repo>@<digest>`,
# emit `{"<var_name>": "<full uri>"}`. `//` is jq's alternative operator —
# each field errors loudly if absent rather than silently shipping `null`.
_FILTER_TEMPLATE = """\
.operations[0] as $op
| {{"{var_name}": "\\($op.registry // error("manifest missing .operations[0].registry"))/\\($op.repository // error("manifest missing .operations[0].repository"))@\\($op.root.digest // error("manifest missing .operations[0].root.digest"))"}}
"""

def _deploy_manifest_impl(ctx):
    return [DefaultInfo(files = depset([ctx.attr.image_push[DeployInfo].deploy_manifest]))]

_deploy_manifest = rule(
    implementation = _deploy_manifest_impl,
    attrs = {
        "image_push": attr.label(
            mandatory = True,
            providers = [DeployInfo],
        ),
    },
    doc = "Internal: exposes an `image_push` target's DeployInfo.deploy_manifest as a DefaultInfo file so stock rules (like `jq`) can consume it via `srcs`.",
)

def image_tfvars(name, image_push, var_name = "image", out_file = None, **kwargs):
    """Emit `{"<var_name>": "<registry>/<repo>@sha256:..."}` for an `image_push` target.

    With `out_file`: creates a single target `:<name>` that, when run, writes
    the JSON into the source tree at `out_file`. This is the usual mode for
    Terraform roots — `bazel run :<name>` is the one command to prep the
    deploy.

    Without `out_file`: creates a single target `:<name>` whose default output
    is `<name>.json` in bazel-out. Useful when the JSON is consumed by further
    Bazel steps rather than materialized into a source tree.

    Args:
        name: Target name.
        image_push: Label of an `@rules_img` `image_push` target (carries DeployInfo).
        var_name: Terraform variable name to pin the URI to. Defaults to `image`.
        out_file: If set, source-tree path (relative to the calling package)
            where the JSON is materialized by `bazel run :<name>`.
        **kwargs: Forwarded to the outermost target (`jq` when `out_file` is None,
            `write_source_file` otherwise).
    """
    manifest_target = "_{}_manifest".format(name)
    _deploy_manifest(
        name = manifest_target,
        image_push = image_push,
        visibility = ["//visibility:private"],
    )

    if out_file == None:
        jq(
            name = name,
            srcs = [":" + manifest_target],
            filter = _FILTER_TEMPLATE.format(var_name = var_name),
            **kwargs
        )
        return

    json_target = "_{}_json".format(name)
    jq(
        name = json_target,
        srcs = [":" + manifest_target],
        filter = _FILTER_TEMPLATE.format(var_name = var_name),
        visibility = ["//visibility:private"],
    )
    write_source_file(
        name = name,
        in_file = ":" + json_target,
        out_file = out_file,
        **kwargs
    )
