"React application macro with Starlark-defined routes and lazy loading"

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@bazel_lib//lib:expand_template.bzl", "expand_template")
load("//devtools/build/js:devserver.bzl", "devserver")
load(":asset_pipeline.bzl", "asset_pipeline")
load(":labels.bzl", "ts_dep")
load(":react_app_manifest.bzl", "react_app_manifest")
load(":react_component.bzl", "react_component")
load(":stylex_css.bzl", "stylex_css")

def route(path, component = None, children = None):
    """Define a route mapping a URL path to a react_component target.

    Args:
        path: URL path (e.g. "/", "about", ":city")
        component: label of a react_component target (optional for grouping routes)
        children: list of nested route() dicts (optional)
    """
    r = {"path": path}
    if component:
        r["component"] = component
    if children:
        r["children"] = children
    return r

def react_app(name, layout, routes, browser_deps, jit_open_props = False, html_template = None, **kwargs):
    """Build a React application with Starlark-defined routes and lazy loading.

    Routes are defined in BUILD files and compiled to React Router's
    createBrowserRouter config with lazy() imports for per-route code splitting.
    Import paths are derived from each component target's DefaultInfo by
    looking up `{target_name}.js` — the same naming convention enforced by
    react_component's export-name test.

    Produces:
      - :{name}_devserver — dev server with unbundled ESM
      - :{name}_bundle — production esbuild bundle
      - :{name}_styles — collected StyleX CSS (transitive via stylex_metadata_aspect)
      - :{name}_html — production index.html

    Args:
        name: target name prefix
        layout: label of the root layout react_component (renders <Outlet />)
        routes: list of route() dicts (supports nesting)
        browser_deps: list of browser_dep labels for the devserver
        html_template: optional custom HTML template (defaults to built-in)
        **kwargs: passed through to downstream targets (e.g. visibility, tags)
    """

    # Flatten route tree: collect ordered component list and build
    # index-based route config for the manifest rule (iterative — Starlark
    # doesn't allow recursion)
    ordered_components = []
    flat_routes = []
    stack = [(routes, flat_routes)]
    for _ in range(1000):
        if not stack:
            break
        route_list, output = stack.pop()
        for r in route_list:
            entry = {"path": r["path"]}
            if "component" in r:
                entry["component_idx"] = len(ordered_components)
                ordered_components.append(r["component"])
            if "children" in r:
                entry["children"] = []
                stack.append((r["children"], entry["children"]))
            output.append(entry)
    if stack:
        fail("route tree flattening exceeded 1000 iterations; route manifest would be truncated")

    all_route_components = [layout] + ordered_components

    # Generate route manifest — looks up .js entries from each target's DefaultInfo
    manifest_name = name + "_manifest"
    react_app_manifest(
        name = manifest_name,
        layout = layout,
        route_components = ordered_components,
        route_config = json.encode(flat_routes),
    )

    # Generate router.tsx and main.tsx from manifest
    codegen_name = name + "_codegen"
    js_run_binary(
        name = codegen_name,
        srcs = [manifest_name + ".json"],
        outs = [name + "_router.tsx", name + "_main.tsx"],
        args = [
            "--manifest",
            "$(location {}.json)".format(manifest_name),
            "--out-router",
            "$(location {}_router.tsx)".format(name),
            "--out-main",
            "$(location {}_main.tsx)".format(name),
        ],
        tool = "//devtools/build/react_component:react_app_codegen_bin",
    )

    # Compile generated router. Deps on route components are needed for
    # tsc type-checking of dynamic import() expressions, even though
    # the imports are lazy at runtime.
    react_component(
        name = name + "_router",
        srcs = [name + "_router.tsx"],
        _export_test = False,
        deps = all_route_components + [
            "//:node_modules/react-router",
        ],
    )

    # Compile generated main (entry point)
    react_component(
        name = name + "_main",
        srcs = [name + "_main.tsx"],
        _export_test = False,
        deps = [
            ":" + name + "_router",
            "//:node_modules/react-dom",
            "//:node_modules/@types/react-dom",
            "//:node_modules/react-router",
        ],
    )

    # Collect StyleX CSS from all route components (transitive via stylex_metadata_aspect)
    stylex_css(
        name = name + "_styles",
        components = all_route_components,
        jit_open_props = jit_open_props,
    )

    # Aggregate hashed static assets across all route components:
    #   :{name}_assets_flat  — flat TreeArtifact with all hashed files
    #   :{name}_assets.json  — devserver manifest (URL → filename)
    asset_pipeline(
        name = name + "_assets",
        components = all_route_components,
    )

    # HTML template
    tpl_name = html_template or "//devtools/build/react_component:index.html.tpl"

    # Production HTML
    expand_template(
        name = name + "_html",
        out = name + "_index.html",
        substitutions = {
            "{{HEAD}}": '<link rel="stylesheet" href="/{}_styles.css" />'.format(name),
            "{{SCRIPTS}}": '<script src="/{}_bundle.js"></script>'.format(name),
        },
        template = tpl_name,
        **kwargs
    )

    # esbuild and devserver need _ts targets (which carry JsInfo)
    all_ts_targets = [ts_dep(c) for c in all_route_components]

    # Production bundle. Asset files ride as data so they end up in the
    # bundle's runfiles; URLs are baked into JS by asset_codegen, so
    # esbuild doesn't need to see the binaries directly.
    esbuild(
        name = name + "_bundle",
        entry_point = name + "_main.js",
        deps = [
            ":" + name + "_main_ts",
        ] + all_ts_targets + [
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/react-router",
            "//:node_modules/@stylexjs/stylex",
        ],
        data = [":" + name + "_assets"],
        **kwargs
    )

    # Dev server
    devserver(
        name = name + "_devserver",
        entry_point = ":" + name + "_main_ts",
        entry_js = name + "_main.js",
        components = [":" + name + "_main_ts", ":" + name + "_router_ts"] + all_ts_targets,
        browser_deps = browser_deps,
        html_template = tpl_name,
        css = ":" + name + "_styles",
        assets_manifest = ":" + name + "_assets.json",
        assets_dir = ":" + name + "_assets",
        **kwargs
    )
