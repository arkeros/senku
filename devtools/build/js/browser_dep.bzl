"Rule to prepare an npm package for browser consumption"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def browser_dep(name, package, deps, bundle = False, external = [], **kwargs):
    """Prepare an npm package for browser consumption.

    - CJS packages: always bundled to a single ESM file with esbuild
    - ESM packages: served directly from node_modules (no bundling)
    - ESM packages with bundle=True: force-bundled (for packages that mix
      client and server code, like react-router)

    Outputs:
        <name>.js: bundled ESM file (CJS or forced) or placeholder (ESM)
        <name>.json: manifest describing how the devserver should serve this dep

    Args:
        name: target name
        package: npm package specifier (e.g. "react/jsx-runtime")
        deps: npm node_modules labels needed to resolve the package
        bundle: force esbuild bundling even for ESM packages
        external: packages to keep as bare imports when bundling (avoids
            duplicating deps like react that have their own browser_dep)
        **kwargs: passed through to js_run_binary
    """
    args = [
        "--package",
        package,
        "--output-js",
        "$(location {}.js)".format(name),
        "--output-manifest",
        "$(location {}.json)".format(name),
    ]
    if bundle:
        args.append("--bundle")
    for ext in external:
        args.extend(["--external", ext])

    js_run_binary(
        name = name,
        srcs = deps,
        outs = [name + ".js", name + ".json"],
        args = args,
        tool = Label("//devtools/build/js:browser_dep_bin"),
        **kwargs
    )

    # Expose node_modules deps so the devserver can serve ESM files directly
    native.filegroup(
        name = name + "_node_modules",
        srcs = deps,
        visibility = kwargs.get("visibility"),
    )
