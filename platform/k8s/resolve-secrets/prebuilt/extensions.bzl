"""Module extension for the prebuilt resolve-secrets CLI.

Unlike bifrost, resolve-secrets has no Starlark rule that invokes it, so
this extension doesn't register a toolchain. It just downloads the
platform binary from GitHub Releases and wraps it in a sh_binary target
that downstream consumers can use as a data dep.
"""

load(":versions.bzl", "DEFAULT_VERSION", "RESOLVE_SECRETS_VERSIONS", "get_resolve_secrets_url")

def _detect_platform(rctx):
    os = rctx.os.name.lower()
    arch = rctx.os.arch

    if "mac" in os or "darwin" in os:
        platform_os = "darwin"
    elif "linux" in os:
        platform_os = "linux"
    else:
        fail("Unsupported OS: " + os)

    if arch in ("aarch64", "arm64"):
        platform_arch = "arm64"
    elif arch in ("x86_64", "amd64"):
        platform_arch = "amd64"
    else:
        fail("Unsupported arch: " + arch)

    return platform_os + "_" + platform_arch

def _resolve_secrets_repo_impl(rctx):
    version = rctx.attr.version
    platform = _detect_platform(rctx)
    key = version + "-" + platform

    if key not in RESOLVE_SECRETS_VERSIONS:
        fail("resolve-secrets {} not available for {}. Available: {}".format(
            version,
            platform,
            [k for k in RESOLVE_SECRETS_VERSIONS.keys() if k.startswith(version)],
        ))

    filename, sha256 = RESOLVE_SECRETS_VERSIONS[key]
    url = get_resolve_secrets_url(version, filename)

    rctx.download(
        url = url,
        output = "resolve-secrets",
        sha256 = sha256,
        executable = True,
    )

    rctx.file("BUILD.bazel", """\
load("@rules_shell//shell:sh_binary.bzl", "sh_binary")

sh_binary(
    name = "resolve_secrets",
    srcs = ["resolve-secrets"],
    visibility = ["//visibility:public"],
)
""")

_resolve_secrets_repo = repository_rule(
    implementation = _resolve_secrets_repo_impl,
    attrs = {
        "version": attr.string(mandatory = True),
    },
)

def _resolve_secrets_extension_impl(mctx):
    version = DEFAULT_VERSION
    for mod in mctx.modules:
        for prebuilt in mod.tags.prebuilt:
            if prebuilt.version:
                version = prebuilt.version

    _resolve_secrets_repo(name = "resolve_secrets", version = version)

resolve_secrets = module_extension(
    implementation = _resolve_secrets_extension_impl,
    tag_classes = {
        "prebuilt": tag_class(attrs = {
            "version": attr.string(
                doc = "resolve-secrets version to use. Defaults to " + DEFAULT_VERSION,
            ),
        }),
    },
)
