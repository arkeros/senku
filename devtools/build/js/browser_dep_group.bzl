"Rule to bundle multiple CJS packages together, sharing internal code"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def browser_dep_group(name, packages, deps, **kwargs):
    """Bundle multiple CJS packages together with esbuild splitting mode.

    Each package gets its own entry file, but shared internals (like React)
    go into common chunks. This ensures only one copy of shared code exists.

    The output is a directory containing the entry files and chunks, plus
    a manifest JSON.

    Args:
        name: target name
        packages: list of npm package specifiers (e.g. ["react", "react/jsx-runtime"])
        deps: npm node_modules labels needed to resolve all packages
        **kwargs: passed through to js_run_binary
    """
    pkg_args = []
    for pkg in packages:
        pkg_args.extend(["--package", pkg])

    js_run_binary(
        name = name,
        srcs = deps,
        out_dirs = [name],
        outs = [name + ".json"],
        args = [
            "--outdir",
            "$(RULEDIR)/" + name,
            "--manifest",
            "$(location {}.json)".format(name),
        ] + pkg_args,
        tool = "//devtools/build/js:browser_dep_group_bin",
        **kwargs
    )

    # Expose node_modules deps for the devserver
    native.filegroup(
        name = name + "_node_modules",
        srcs = deps,
        visibility = kwargs.get("visibility"),
    )
