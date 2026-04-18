"Label helpers shared by react_component, stylex_library, and react_app"

def is_node_module(dep):
    """True when the label refers to a node_modules package (passed through to ts_project)."""
    return "node_modules" in dep

def ts_dep(dep):
    """Map a react_component/stylex_library label to its internal `_ts` target.

    ts_project consumers need the internal ts_project target, not the public
    wrapper. node_modules labels pass through unchanged.
    """
    if is_node_module(dep):
        return dep
    if dep.startswith("//"):
        # Cross-package: "//examples/stylex/pages:Home" -> "//examples/stylex/pages:Home_ts"
        if ":" in dep:
            return dep + "_ts"
        return dep + ":" + dep.split("/")[-1] + "_ts"
    # Same package: ":Button" -> ":Button_ts"
    return dep + "_ts"
