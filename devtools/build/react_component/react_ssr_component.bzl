"""SSR-aware variant of `react_component` for `react_ssr_app`.

Wraps `react_component` (type-checking, StyleX metadata, i18n, asset
hashing — unchanged) and additionally runs the `dual_compile` transform
on each source to produce two siblings:

  * `<src>.client.js` — `preload` / `meta` named exports stripped, imports
    that were only referenced by them swept out.
  * `<src>.server.js` — full module.

`react_component` stays simple: it doesn't gain any SSR-aware behavior.
SSR opt-in is at the route-component layer — users wire `react_ssr_app`'s
layout / routes / error_component to `react_ssr_component` targets, and
plain `react_component` is still the right tool for everything else
(shared leaf components, design-system primitives, layouts in `react_app`).

Two `js_run_binary` actions per source give Bazel two cache entries; the
alternative — relying on tree-shaking to drop server-only code from the
client bundle — would silently break the moment any of those imports
had a side effect.
"""

load("@aspect_rules_js//js:defs.bzl", "js_library", "js_run_binary")
load(":react_component.bzl", "react_component")

_BABEL_DATA = [
    "//:node_modules/@babel/core",
    "//:node_modules/@babel/preset-react",
    "//:node_modules/@babel/preset-typescript",
]

def _strip_ts_ext(src):
    if src.endswith(".tsx"):
        return src[:-len(".tsx")]
    if src.endswith(".mts"):
        return src[:-len(".mts")]
    if src.endswith(".ts"):
        return src[:-len(".ts")]
    fail("react_ssr_component: srcs must end in .tsx, .ts, or .mts, got: " + src)

def react_ssr_component(name, srcs, deps = [], assets = [], i18n = [], **kwargs):
    """Build an SSR-aware React component.

    Identical surface to `react_component` plus the dual-compile outputs
    (`:{name}_client` and `:{name}_server`). Use for the layout, routes,
    and error components of a `react_ssr_app`. Plain `react_component`
    targets — leaf UI primitives, anything reused outside SSR — are
    unchanged and can still be `deps` of an SSR component.

    Produces (in addition to everything `react_component` produces):
      - :{name}_client  — filegroup of `<src>.client.js` outputs.
      - :{name}_server  — filegroup of `<src>.server.js` outputs.

    Args:
        name: target name; must match the exported component name.
        srcs: .ts / .tsx / .mts source files.
        deps: other component targets or node_modules labels.
        assets: static asset files to content-hash.
        i18n: per-locale MF2 catalog fragments.
        **kwargs: passed through to `react_component` and the generated
            sub-targets (`visibility`, `tags`, `testonly`).
    """
    react_component(
        name = name,
        srcs = srcs,
        deps = deps,
        assets = assets,
        i18n = i18n,
        **kwargs
    )

    forward_kwargs = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}

    client_outs = []
    server_outs = []

    for idx, src in enumerate(srcs):
        # `.d.ts` files exist only for type-checking — they have no
        # runtime contents to dual-compile.
        if src.endswith(".d.ts") or src.endswith(".d.mts"):
            continue

        base = _strip_ts_ext(src)
        client_out = base + ".client.js"
        client_map = client_out + ".map"
        server_out = base + ".server.js"
        server_map = server_out + ".map"

        for mode, out_file, map_file in [
            ("client", client_out, client_map),
            ("server", server_out, server_map),
        ]:
            js_run_binary(
                name = "{}_{}_{}".format(name, idx, mode),
                srcs = [src] + _BABEL_DATA,
                outs = [out_file, map_file],
                args = [
                    "$(location {})".format(src),
                    "--mode",
                    mode,
                    "--out-file",
                    "$(location {})".format(out_file),
                ],
                tool = Label("//devtools/build/react_component:dual_compile_bin"),
                **forward_kwargs
            )

        client_outs.append(client_out)
        server_outs.append(server_out)

    # `js_library` (rather than `filegroup`) so the dual outputs travel
    # as JsInfo — esbuild's `deps` rejects targets that lack it.
    js_library(
        name = name + "_client",
        srcs = client_outs,
        **forward_kwargs
    )

    js_library(
        name = name + "_server",
        srcs = server_outs,
        **forward_kwargs
    )
