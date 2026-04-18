"Dev server macro that serves components as ESM with pre-built browser deps"

load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_lib//lib:copy_file.bzl", "copy_file")

def devserver(name, entry_point, components, browser_deps, html_template, css, entry_js = None, assets_manifest = None, assets_dir = None, **kwargs):
    """Dev server that serves React components as unbundled ESM with import maps.

    Uses pre-built browser_dep targets (defined once, shared across apps)
    to serve npm deps. ESM packages are served directly from node_modules,
    CJS packages are served from pre-bundled ESM files.

    Args:
        name: target name
        entry_point: the index component target (e.g. ":index")
        components: list of component targets to serve
        browser_deps: list of browser_dep target labels (e.g. ["//devtools/build/js:react_jsx_runtime"]).
            Order matters: the first manifest that defines a specifier wins in the import map,
            so list explicit browser_dep/browser_dep_group targets before any that pull in
            transitive ESM discoveries (see devserver.mjs:63-70).
        html_template: label of the index.html.tpl template
        css: label of the CSS target
        assets_manifest: optional label pointing at an asset_pipeline devserver
            manifest (type: "assets"). When set, the server registers every
            URL → runfiles path for content-hashed static assets.
        assets_dir: optional label pointing at the flat assets TreeArtifact
            (sibling to `assets_manifest`). Must be set together with it.
        **kwargs: passed through to js_binary (e.g. visibility, tags)
    """
    # Collect manifest files and node_modules deps from browser_dep targets.
    # Order is preserved end-to-end: first manifest wins in the import map, so
    # explicit deps must come before targets that expose transitive discoveries.
    manifest_files = []
    dep_data = []

    for dep in browser_deps:
        # browser_dep/browser_dep_group outputs include <name>.json
        manifest_files.append(dep + ".json")
        dep_data.append(dep)  # default outputs (dir or .js)
        dep_data.append(dep + ".json")  # manifest
        dep_data.append(dep + "_node_modules")  # node_modules for ESM serving

    manifest_args = []
    for mf in manifest_files:
        manifest_args.extend(["--manifest", "$(location {})".format(mf)])

    asset_args = []
    asset_data = []
    if assets_manifest and assets_dir:
        asset_args = [
            "--assets-manifest",
            "$(location {})".format(assets_manifest),
            "--assets-dir",
            "$(location {})".format(assets_dir),
        ]
        asset_data = [assets_manifest, assets_dir]
    elif assets_manifest or assets_dir:
        fail("devserver: assets_manifest and assets_dir must be set together")

    if not entry_js:
        entry_js = entry_point.lstrip(":") + ".js" if entry_point.startswith(":") else entry_point + ".js"

    # Copy cross-package files into this package so js_binary can use them
    copy_file(
        name = name + "_devserver_script",
        src = "//devtools/build/js:devserver.mjs",
        out = name + "_devserver.mjs",
    )

    html_copy = name + "_html_tpl"
    copy_file(
        name = html_copy,
        src = html_template,
        out = name + "_index.html.tpl",
    )

    js_binary(
        name = name,
        entry_point = name + "_devserver.mjs",
        args = [
            "--js-dir",
            "$(location {})".format(entry_js),
            "--css",
            "$(location {})".format(css),
            "--html",
            "$(location :{})".format(html_copy),
        ] + manifest_args + asset_args,
        data = components + dep_data + asset_data + [
            css,
            ":" + html_copy,
            entry_js,
            "//:node_modules/mime",
        ],
        **kwargs
    )
