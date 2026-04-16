"React application macro with Starlark-defined routes"

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@bazel_lib//lib:expand_template.bzl", "expand_template")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load("//devtools/build/js:devserver.bzl", "devserver")
load(":react_component.bzl", "react_component")
load(":stylex_css.bzl", "stylex_css")

def route(path, component = None, children = None, import_path = None):
    """Define a route mapping a URL path to a react_component target.

    Args:
        path: URL path (e.g. "/", "about", ":city")
        component: label of a react_component target (optional for grouping routes)
        children: list of nested route() dicts (optional)
        import_path: JS import path override (defaults to derived from label)
    """
    r = {"path": path}
    if component:
        r["component"] = component
        if import_path:
            r["import_path"] = import_path
    if children:
        r["children"] = children
    return r

def react_app(name, layout, routes, browser_deps, components = [], html_template = None, **kwargs):
    """Build a React application with Starlark-defined routes.

    Generates a React Router configuration from route definitions in BUILD files.
    Supports nested routes and route parameters.

    Produces:
      - :{name}_devserver — dev server with unbundled ESM
      - :{name}_bundle — production esbuild bundle
      - :{name}_styles — collected StyleX CSS
      - :{name}_html — production index.html

    Args:
        name: target name prefix
        layout: label of the root layout react_component (renders <Outlet />)
        routes: list of route() dicts (supports nesting)
        browser_deps: list of browser_dep labels for the devserver
        components: additional react_component targets whose StyleX styles
            should be collected (for non-route components like Button)
        html_template: optional custom HTML template (defaults to built-in)
        **kwargs: passed through to downstream targets (e.g. visibility, tags)
    """

    # Derive JS import path from a Bazel label relative to this package.
    def _import_path(label):
        if label.startswith("//"):
            pkg_and_target = label.lstrip("/")
            if ":" in pkg_and_target:
                pkg, target_name = pkg_and_target.split(":")
            else:
                pkg = pkg_and_target
                target_name = pkg_and_target.split("/")[-1]
            this_pkg = native.package_name()
            if pkg.startswith(this_pkg + "/"):
                rel = pkg[len(this_pkg) + 1:]
            else:
                rel = pkg
            return "./" + rel + "/" + target_name
        else:
            target_name = label.lstrip(":")
            return "./" + target_name

    # Convert a route list to manifest format iteratively.
    # Uses a stack with (input_routes, output_list) pairs.
    def _routes_to_manifest(route_list):
        result = []
        # Stack: (remaining_input_routes, output_list_to_append_to)
        stack = [(route_list, result)]
        for _ in range(1000):  # safety bound
            if not stack:
                break
            routes_to_process, output = stack.pop()
            for r in routes_to_process:
                entry = {"path": r["path"]}
                if "component" in r:
                    entry["component"] = {
                        "target": r["component"],
                        "import": r.get("import_path") or _import_path(r["component"]),
                    }
                if "children" in r:
                    entry["children"] = []
                    stack.append((r["children"], entry["children"]))
                output.append(entry)
        return result

    # Collect all component labels from routes (iterative, any depth)
    all_route_components = [layout]
    stack = list(routes)
    for _ in range(1000):  # safety bound
        if not stack:
            break
        r = stack.pop()
        if "component" in r:
            all_route_components.append(r["component"])
        stack.extend(r.get("children", []))

    manifest = {
        "layout": {
            "target": layout,
            "import": _import_path(layout),
        },
        "routes": _routes_to_manifest(routes),
    }

    # Write manifest JSON
    manifest_name = name + "_route_manifest"
    write_file(
        name = manifest_name,
        out = manifest_name + ".json",
        content = [json.encode(manifest)],
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

    # Compile generated router
    react_component(
        name = name + "_router",
        srcs = [name + "_router.tsx"],
        deps = all_route_components + [
            "//:node_modules/react-router",
        ],
    )

    # Compile generated main (entry point)
    react_component(
        name = name + "_main",
        srcs = [name + "_main.tsx"],
        deps = [
            ":" + name + "_router",
            "//:node_modules/react-dom",
            "//:node_modules/@types/react-dom",
            "//:node_modules/react-router",
        ],
    )

    # Collect StyleX CSS from all components
    stylex_css(
        name = name + "_styles",
        components = all_route_components + components,
        output = name + "_styles.css",
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
    )

    # Production bundle
    esbuild(
        name = name + "_bundle",
        entry_point = name + "_main.js",
        deps = [
            ":" + name + "_main",
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/react-router",
            "//:node_modules/@stylexjs/stylex",
        ],
    )

    # Dev server
    devserver(
        name = name + "_devserver",
        entry_point = ":" + name + "_main",
        components = [":" + name + "_main", ":" + name + "_router"] + all_route_components,
        browser_deps = browser_deps,
        html_template = tpl_name,
        css = ":" + name + "_styles",
    )
