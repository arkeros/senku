"Rule that generates a route manifest from component targets"

load(":route_tree.bzl", "walk_route_tree")

def _find_js_entry(target):
    """Return the .js File in target's DefaultInfo whose basename is {name}.js.

    react_component targets follow the convention that the target name matches
    both the exported React component and the JS entry filename (enforced by
    the export-name test on each react_component). The manifest rule leans on
    that same convention here — no provider needed.
    """
    expected = target.label.name + ".js"
    for f in target[DefaultInfo].files.to_list():
        if f.basename == expected:
            return f
    fail(
        "react_app_manifest: target {} does not produce {} among its outputs. ".format(target.label, expected) +
        "The react_component target name must match its JS entry filename (and its exported component name).",
    )

def _react_app_manifest_impl(ctx):
    # Parse the route config (flattened at loading time by the macro)
    route_config = json.decode(ctx.attr.route_config)

    layout_js = _find_js_entry(ctx.attr.layout)
    layout_name = ctx.attr.layout.label.name
    route_js = [_find_js_entry(c) for c in ctx.attr.route_components]
    route_names = [c.label.name for c in ctx.attr.route_components]

    # Compute the output directory for relative path calculation
    manifest_dir = ctx.outputs.manifest.dirname

    def _rel_path(js_file):
        """Compute relative import path from manifest location to the .js file."""
        file_dir = js_file.dirname
        file_base = js_file.basename.replace(".js", "")

        # Both are under bazel-bin/<package>/...
        # We need the relative path from the manifest to the file
        if file_dir == manifest_dir:
            return "./" + file_base
        elif file_dir.startswith(manifest_dir + "/"):
            return "./" + file_dir[len(manifest_dir) + 1:] + "/" + file_base
        else:
            # Cross-package: compute relative path
            # Count shared prefix
            m_parts = manifest_dir.split("/")
            f_parts = file_dir.split("/")
            common = 0
            for i in range(min(len(m_parts), len(f_parts))):
                if m_parts[i] == f_parts[i]:
                    common += 1
                else:
                    break
            ups = len(m_parts) - common
            downs = "/".join(f_parts[common:])
            rel = "/".join([".."] * ups)
            if downs:
                rel = rel + "/" + downs if rel else downs
            return "./" + rel + "/" + file_base if rel else "./" + file_base

    def _enrich(r):
        fields = {}
        if "component_idx" in r:
            idx = r["component_idx"]
            fields["import"] = _rel_path(route_js[idx])
            fields["name"] = route_names[idx]
        if "error_component_idx" in r:
            idx = r["error_component_idx"]
            fields["error_import"] = _rel_path(route_js[idx])
            fields["error_name"] = route_names[idx]
        return fields

    enriched_routes = walk_route_tree(route_config, _enrich)

    layout_entry = {
        "import": _rel_path(layout_js),
        "name": layout_name,
    }
    if ctx.attr.layout_error_component:
        err_target = ctx.attr.layout_error_component
        layout_entry["error_import"] = _rel_path(_find_js_entry(err_target))
        layout_entry["error_name"] = err_target.label.name

    manifest = {
        "layout": layout_entry,
        "routes": enriched_routes,
    }

    ctx.actions.write(
        output = ctx.outputs.manifest,
        content = json.encode_indent(manifest, indent = "  "),
    )

    return [DefaultInfo(files = depset([ctx.outputs.manifest]))]

react_app_manifest = rule(
    implementation = _react_app_manifest_impl,
    attrs = {
        "layout": attr.label(
            mandatory = True,
            doc = "The layout react_component target",
        ),
        "layout_error_component": attr.label(
            doc = "Optional react_component rendered as the app-wide errorElement on the layout route",
        ),
        "route_components": attr.label_list(
            doc = "Ordered list of route react_component targets (indexed by route_config)",
        ),
        "route_config": attr.string(
            mandatory = True,
            doc = "JSON-encoded route tree with component_idx references",
        ),
    },
    outputs = {
        "manifest": "%{name}.json",
    },
)
