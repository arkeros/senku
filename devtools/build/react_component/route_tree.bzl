"Shared iterative walker for the panallet route tree (Starlark forbids recursion)."

_MAX_DEPTH = 1000

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
