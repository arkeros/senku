"Label helpers shared by react_component, stylex_library, and react_app"

def is_node_module(dep):
    """True when the label refers to a node_modules package (passed through to ts_project).

    Accepts both string labels and `Label` objects — react_app wraps framework
    deps in `Label("//:node_modules/...")` so they resolve to @senku-controlled
    target paths when the macros are called from another module.
    """
    return "node_modules" in str(dep)

def ts_dep(dep):
    """Map a react_component/stylex_library label to its internal `_ts` target.

    ts_project consumers need the internal ts_project target, not the public
    wrapper. node_modules labels pass through unchanged. Label objects (used by
    framework deps wrapped in Label() to anchor at @senku) also pass through —
    they already point at the right target.
    """
    if is_node_module(dep):
        return dep
    if type(dep) == "Label":
        return dep
    if dep.startswith("//"):
        # Cross-package: "//examples/stylex/pages:Home" -> "//examples/stylex/pages:Home_ts"
        if ":" in dep:
            return dep + "_ts"
        return dep + ":" + dep.split("/")[-1] + "_ts"
    # Same package: ":Button" -> ":Button_ts"
    return dep + "_ts"
