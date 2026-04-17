"Rule that generates route manifest from ReactComponentInfo providers"

load(":providers.bzl", "ReactComponentInfo")

def _react_app_manifest_impl(ctx):
    # Parse the route config (flattened at loading time by the macro)
    route_config = json.decode(ctx.attr.route_config)

    # Read ReactComponentInfo from layout and route components
    layout_info = ctx.attr.layout[ReactComponentInfo]
    component_infos = [c[ReactComponentInfo] for c in ctx.attr.route_components]

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

    # Enrich route config with actual import paths from providers (iterative)
    enriched_routes = []
    stack = [(route_config, enriched_routes)]
    for _ in range(1000):
        if not stack:
            break
        routes_in, routes_out = stack.pop()
        for r in routes_in:
            entry = {"path": r["path"]}
            if "component_idx" in r:
                idx = r["component_idx"]
                info = component_infos[idx]
                entry["import"] = _rel_path(info.js_entry)
                entry["name"] = info.name
            if "children" in r:
                entry["children"] = []
                stack.append((r["children"], entry["children"]))
            routes_out.append(entry)

    if stack:
        fail("Route tree too deep (exceeded 1000 iterations). Simplify route structure or increase limit.")

    manifest = {
        "layout": {
            "import": _rel_path(layout_info.js_entry),
            "name": layout_info.name,
        },
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
            providers = [ReactComponentInfo],
            doc = "The layout react_component target",
        ),
        "route_components": attr.label_list(
            providers = [ReactComponentInfo],
            doc = "Ordered list of route components (indexed by route_config)",
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
