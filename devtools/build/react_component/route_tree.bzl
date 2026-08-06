"Shared iterative walker for the panellet route tree (Starlark forbids recursion)."

_MAX_DEPTH = 1000

def route_objects(routes):
    """The URL paths a client can request that the app answers itself.

    A bucket routes by object existence, so a client-side route only returns
    200 if something is actually there. These are the paths a webroot has to
    materialise; everything else falls to the URL map's fallback, which
    serves the shell under an honest 404.

    Three kinds of path are deliberately absent. `"*"` is not a path — it is
    the statement that the shell should answer unknown URLs, which is exactly
    what the fallback does. `"/"` is already served by the bucket's
    `main_page_suffix`.

    A dynamic segment (`":city"`) is skipped along with everything under it,
    because its values are not known at build time and no finite set of
    objects covers it. **A bucket-served app with a dynamic route will answer
    that route with a 404** unless the URL map is given a `path_rule` for the
    pattern — see `_spa_fallback` in //infra/cloud/gcp/lb. This is not
    checked here: `react_app` is also used for apps that are never published
    to a bucket, so it cannot know whether the gap matters.

    Nested children are joined onto their parent here, which
    `walk_route_tree` does not do — it preserves the tree rather than
    flattening it to URLs.

    Args:
        routes: list of route dicts (each must have "path")

    Returns:
        List of `struct(path, component)`, sorted by path. `path` is
        webroot-relative with no leading slash; `component` is the route's
        component label, or None for a route that only groups children.
    """
    out = []
    stack = [(routes, "")]
    for _ in range(_MAX_DEPTH):
        if not stack:
            return sorted(out, key = lambda e: e.path)
        routes_in, prefix = stack.pop()
        for r in routes_in:
            path = r["path"]
            if path == "*":
                continue

            segment = path
            if segment.startswith("/"):
                segment = segment[1:]
            if segment.endswith("/"):
                segment = segment[:-1]

            # A dynamic segment takes its subtree with it: a child of an
            # unenumerable parent is unenumerable too.
            if ":" in segment:
                continue

            joined = prefix
            if segment:
                joined = prefix + "/" + segment if prefix else segment
                out.append(struct(path = joined, component = r.get("component")))

            if "children" in r:
                stack.append((r["children"], joined))
    fail("route tree exceeded {} iterations; structure too deep or cyclic".format(_MAX_DEPTH))

def walk_route_tree(routes, visit):
    """Walk routes iteratively, producing a parallel tree.

    Parent entries are created before any of their descendants, but this is not
    a strict depth-first pre-order traversal: all siblings in the current input
    list are processed before descending into children, and because pending
    child lists are stored on a LIFO stack, the last sibling's children are
    processed first.

    For each input route dict, the returned tree contains {"path": r["path"]}
    merged with whatever fields `visit(r)` returns. If the input route has
    "children", they are iteratively processed and attached as "children" on
    the output.

    Args:
        routes: list of route dicts (each must have "path")
        visit: fn(route_dict) -> dict of extra fields for the output entry

    Returns:
        list of transformed route dicts
    """
    output = []
    stack = [(routes, output)]
    for _ in range(_MAX_DEPTH):
        if not stack:
            return output
        routes_in, routes_out = stack.pop()
        for r in routes_in:
            entry = {"path": r["path"]}
            entry.update(visit(r))
            if "children" in r:
                entry["children"] = []
                stack.append((r["children"], entry["children"]))
            routes_out.append(entry)
    fail("route tree exceeded {} iterations; structure too deep or cyclic".format(_MAX_DEPTH))
