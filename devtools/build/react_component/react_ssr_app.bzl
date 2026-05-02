"""SSR React application macro — Hono Node server, single-process OCI image.

Mirrors `react_app` for the SPA case: same Starlark-defined route tree,
same StyleX/i18n/asset pipelines, same `runtime_config`/`locales` arguments.
Differs at the runtime layer — the prod image is a distroless-Node Hono
server that renders HTML per request and serves the bundle/asset files
itself, and the devserver is the same Hono process restarted by ibazel
on rebuild rather than a static-file server with import maps.

Implementation lands incrementally per `docs/panellet-ssr-roadmap.md`:
this commit is roadmap step 5 — Hono server uses `serveStatic` for
CSS / asset URLs, with a catch-all that still returns a stub HTML page;
the codegen, `createStaticHandler`, preload/meta wiring, and the
`react_ssr_layer` OCI image land in subsequent commits.
"""

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_run_binary")
load("@bazel_lib//lib:copy_file.bzl", "copy_file")
load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")
load(":asset_pipeline.bzl", "asset_pipeline")
load(":labels.bzl", "ts_dep")
load(":react_app_manifest.bzl", "react_app_manifest")
load(":react_component.bzl", "react_component")
load(":route_tree.bzl", "walk_route_tree")
load(":runtime_config.bzl", "validate_runtime_config")
load(":stylex_css.bzl", "stylex_css")

# `target = "node22"` matches the distroless-Node image used by
# `react_ssr_layer` and our local Node toolchain. Bumped together when
# the image moves.
_NODE_TARGET = "node22"

def _collect_route_components(layout, routes, error_component):
    """Walk routes and return a deduped, ordered list of all referenced components.

    Mirrors `react_app`'s `all_route_components` derivation. Lifted out so
    `react_ssr_app` doesn't have to re-implement the dedup logic and so
    the same shape can be passed to the shared `stylex_css`,
    `asset_pipeline`, and (later) i18n machinery.
    """
    ordered = []
    seen = {}

    def _intern(c):
        if c not in seen:
            seen[c] = True
            ordered.append(c)

    _intern(layout)

    def _visit(r):
        if "component" in r:
            _intern(r["component"])
        if "error_component" in r:
            _intern(r["error_component"])
        return {}

    walk_route_tree(routes, _visit)

    if error_component:
        _intern(error_component)

    return ordered

def react_ssr_app(
        name,
        layout,
        routes,
        browser_deps,
        error_component = None,
        jit_open_props = False,
        html_template = None,
        runtime_config = None,
        locales = None,
        source_locale = None,
        **kwargs):
    """Build an SSR React application.

    Args mirror `react_app` (see `react_app.bzl` for full docs); the SSR
    semantics for `runtime_config`, `locales`, `preload`, and `meta` land
    alongside the implementation in subsequent roadmap steps.

    Produces today (roadmap step 5):
      - :{name}_server_bundle  — single-file ESM Node bundle.
      - :{name}_styles         — collected StyleX CSS (via stylex_css).
      - :{name}_normalize_css  — open-props' normalize.min.css.
      - :{name}_assets         — content-hashed assets TreeArtifact.
      - :{name}_static         — flat directory containing the above,
                                  pointed at by the server's
                                  `PANELLET_STATIC_DIR` env.
      - :{name}_devserver      — js_binary that runs the server bundle
                                  with the runfiles static dir wired in
                                  and the `ibazel_notify_changes` tag so
                                  ibazel restarts on rebuild.

    Args:
        name: target name prefix.
        layout: label of the root layout react_ssr_component (renders <Outlet />).
        routes: list of route() dicts; supports nesting.
        browser_deps: list of browser_dep labels for client-side modules.
        error_component: optional app-wide error react_ssr_component.
        jit_open_props: whether to JIT-tree-shake Open Props custom properties.
        html_template: optional custom HTML shell template.
        runtime_config: optional `{UPPER_SNAKE: dev_default}` dict.
        locales: optional list of locales the app supports.
        source_locale: authoritative locale; defaults to `locales[0]`.
        **kwargs: passed through to downstream targets.
    """
    if type(name) != "string" or not name:
        fail("react_ssr_app: name must be a non-empty string")
    if not layout:
        fail("react_ssr_app: layout is required")
    if type(routes) != "list":
        fail("react_ssr_app: routes must be a list")
    if type(browser_deps) != "list":
        fail("react_ssr_app: browser_deps must be a list")
    if runtime_config != None:
        validate_runtime_config(runtime_config)
    if locales != None:
        if type(locales) != "list" or not locales:
            fail("react_ssr_app: locales must be a non-empty list when set")
        if source_locale != None and source_locale not in locales:
            fail("react_ssr_app: source_locale \"{}\" is not in locales {}".format(
                source_locale,
                locales,
            ))

    # Future-roadmap consumers — referenced here so Buildifier knows the
    # macro intentionally accepts these args even when v1 ignores them.
    _ = (
        html_template,
        locales,
        source_locale,
        browser_deps,
    )  # buildifier: disable=unused-variable

    forward_kwargs = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}

    all_route_components = _collect_route_components(layout, routes, error_component)

    # Flatten the route tree into the index-based shape that
    # `react_app_manifest` (shared with `react_app`) expects: each entry
    # carries `component_idx` / `error_component_idx` into the
    # `route_components` label_list, dedup'd to avoid duplicate-label
    # errors when the same component is referenced twice.
    ordered_components = []
    idx_by_component = {}

    def _intern(c):
        idx = idx_by_component.get(c)
        if idx == None:
            idx = len(ordered_components)
            idx_by_component[c] = idx
            ordered_components.append(c)
        return idx

    def _collect(r):
        fields = {}
        if "component" in r:
            fields["component_idx"] = _intern(r["component"])
        if "error_component" in r:
            fields["error_component_idx"] = _intern(r["error_component"])
        return fields

    flat_routes = walk_route_tree(routes, _collect)

    # 1. Manifest: same rule as react_app — emits {layout, routes:[…]} JSON
    # with .js import paths derived from each component target's outputs.
    # We import from those `.js` paths in the server entry; the dual-
    # compile's `.server.js` is byte-identical at this step (full module),
    # and using `.js` keeps tsc happy via the existing `.d.ts`. Step 7
    # switches the *client* codegen to `.client.js`.
    manifest_name = name + "_server_manifest"
    react_app_manifest(
        name = manifest_name,
        layout = layout,
        layout_error_component = error_component,
        route_components = ordered_components,
        route_config = json.encode(flat_routes),
        **forward_kwargs
    )

    # 2. Codegen: turn the manifest into a `{name}_server.tsx` that wires
    # up createStaticHandler + renderToPipeableStream.
    client_bundle_url = "/{}_client_bundle/{}_client_main.js".format(name, name)
    js_run_binary(
        name = name + "_server_codegen",
        srcs = [manifest_name + ".json"],
        outs = [name + "_server.tsx"],
        args = [
            "--manifest",
            "$(location {}.json)".format(manifest_name),
            "--out-server",
            "$(location {}_server.tsx)".format(name),
            "--app-title",
            name,
            "--client-bundle-url",
            client_bundle_url,
        ],
        tool = Label("//devtools/build/react_component:react_ssr_app_codegen_bin"),
        **forward_kwargs
    )

    # 3. Type-check + transpile the entry. Deps include every route
    # component's _ts target so tsc resolves the static `import { Foo }
    # from "./.../Foo";` lines the codegen emits.
    react_component(
        name = name + "_server_entry",
        srcs = [name + "_server.tsx"],
        _export_test = False,
        # react_component itself adds //:node_modules/react and
        # //:node_modules/@types/react to ts_project's deps; listing them
        # here too triggers a duplicate-label error.
        deps = all_route_components + [
            "//:node_modules/hono",
            "//:node_modules/@hono/node-server",
            "//:node_modules/@types/node",
            "//:node_modules/react-dom",
            "//:node_modules/@types/react-dom",
            "//:node_modules/react-router",
        ],
        **forward_kwargs
    )

    all_ts_targets = [ts_dep(c) for c in all_route_components]

    # Per-route .client.js / .server.js outputs from react_ssr_component's
    # dual-compile (filegroups). Server bundle imports `.server.js` paths
    # (byte-identical to .js at this step but distinct for cache); client
    # bundle's lazy imports point at `.client.js`.
    all_server_filegroups = [c + "_server" for c in all_route_components]
    all_client_filegroups = [c + "_client" for c in all_route_components]

    # 4. Bundle for Node. `platform = "node"` marks Node built-ins
    # (`node:fs`, etc.) external automatically; everything else (Hono,
    # react, react-dom/server, react-router, route components) is inlined
    # into the single output file. No `splitting` — the prod runtime is
    # `node /app/server.js` and we want one file in the OCI image layer.
    esbuild(
        name = name + "_server_bundle",
        entry_point = name + "_server.js",
        platform = "node",
        target = _NODE_TARGET,
        format = "esm",
        bundle = True,
        define = {"process.env.NODE_ENV": '"production"'},
        config = Label("//devtools/build/react_component:esbuild_react_dedup.config"),
        deps = [
            ":" + name + "_server_entry_ts",
        ] + all_ts_targets + [
            "//:node_modules/hono",
            "//:node_modules/@hono/node-server",
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/react-router",
            "//:node_modules/@stylexjs/stylex",
        ],
        **forward_kwargs
    )

    # 5. Client codegen — same react_app_codegen as the SPA flow, with
    # `--ssr-client`: lazy imports point at `./X.client` so esbuild
    # picks up the dual-compile's stripped `.client.js`, and the entry
    # uses `hydrateRoot` to attach to the SSR-emitted DOM.
    js_run_binary(
        name = name + "_client_codegen",
        srcs = [manifest_name + ".json"],
        outs = [name + "_client_router.tsx", name + "_client_main.tsx"],
        args = [
            "--manifest",
            "$(location {}.json)".format(manifest_name),
            "--out-router",
            "$(location {}_client_router.tsx)".format(name),
            "--out-main",
            "$(location {}_client_main.tsx)".format(name),
            "--ssr-client",
        ],
        tool = Label("//devtools/build/react_component:react_app_codegen_bin"),
        **forward_kwargs
    )

    # 6. Type-check the generated client router + main. The `.client.js`
    # outputs of dual-compile have no sibling `.d.ts`, so `import("./X
    # .client")` would normally trip TS2307. We stage a copy of the
    # ambient declarations file (`*.client` → `any`) into the package
    # so ts_project picks it up alongside the router source.
    copy_file(
        name = name + "_dual_compile_modules_dts",
        src = Label("//devtools/build/react_component:dual_compile_modules.d.ts"),
        out = name + "_dual_compile_modules.d.ts",
        **forward_kwargs
    )

    react_component(
        name = name + "_client_router",
        srcs = [
            name + "_client_router.tsx",
            name + "_dual_compile_modules.d.ts",
        ],
        _export_test = False,
        deps = all_route_components + [
            "//:node_modules/react-router",
        ],
        **forward_kwargs
    )

    react_component(
        name = name + "_client_main",
        srcs = [name + "_client_main.tsx"],
        _export_test = False,
        deps = [
            ":" + name + "_client_router",
            "//:node_modules/react-dom",
            "//:node_modules/@types/react-dom",
            "//:node_modules/react-router",
        ],
        **forward_kwargs
    )

    # 7. Client bundle — splitting on so each lazy route gets its own
    # chunk and shared deps (react, react-dom, …) end up in a chunk that
    # caches across deploys. `output_dir = True` produces a directory of
    # `{name}_client_bundle/{name}_client_main.js` + sibling chunks; the
    # server's Document references `<script type="module"
    # src="/static/{name}_client_bundle/{name}_client_main.js">` (step 7
    # only emits the entry tag — per-route modulepreload is on the
    # backlog, see roadmap).
    #
    # `minify = True` matters: without it, esbuild leaves dead branches
    # like `if ("production" !== "production")` in place even though the
    # `define` substitution rewrote the condition, and React's runtime
    # then logs "DCE has not been applied" to DevTools.
    esbuild(
        name = name + "_client_bundle",
        entry_point = name + "_client_main.js",
        target = "es2020",
        splitting = True,
        output_dir = True,
        minify = True,
        define = {"process.env.NODE_ENV": '"production"'},
        config = Label("//devtools/build/react_component:esbuild_react_dedup.config"),
        deps = [
            ":" + name + "_client_main_ts",
        ] + all_ts_targets + all_client_filegroups + [
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/react-router",
            "//:node_modules/@stylexjs/stylex",
        ],
        **forward_kwargs
    )

    # 4. StyleX stylesheet, transitively collected from every route
    # component via the stylex_metadata aspect.
    stylex_css(
        name = name + "_styles",
        components = all_route_components,
        jit_open_props = jit_open_props,
        **forward_kwargs
    )

    # 5. Normalize CSS — same recipe as react_app: open-props ships
    # `normalize.min.css`, copy-out under a stable name. Sibling stylesheet
    # loaded before app styles (lower precedence on equal specificity).
    #
    # //:node_modules/open-props has two execpath entries (virtual store +
    # symlink); either contains the file, so we pick the first that does.
    normalize_css_target = name + "_normalize_css"
    native.genrule(
        name = normalize_css_target,
        srcs = ["//:node_modules/open-props"],
        outs = [name + "_normalize.css"],
        cmd = "for d in $(execpaths //:node_modules/open-props); do " +
              "if [ -f \"$$d/normalize.min.css\" ]; then " +
              "cp -L \"$$d/normalize.min.css\" $@; exit 0; fi; done; " +
              "echo 'normalize.min.css not found in open-props package' >&2; exit 1",
        **forward_kwargs
    )

    # 6. Hashed asset pipeline — same machinery as react_app.
    asset_pipeline(
        name = name + "_assets",
        components = all_route_components,
        **forward_kwargs
    )

    # 7. Stage everything the server should serve into one directory so
    # the devserver and the prod image both point at a single, stable
    # `PANELLET_STATIC_DIR`. CSS files land at the root (matching
    # `app.use("/*.css", ...)`); the assets TreeArtifact is renamed to
    # `assets/` so the pipeline's hashed filenames sit under `/assets/`
    # in the URL space. The client bundle directory keeps its name so
    # the codegen-emitted `<script src="/{name}_client_bundle/...">`
    # resolves cleanly.
    copy_to_directory(
        name = name + "_static",
        srcs = [
            ":" + name + "_styles",
            ":" + normalize_css_target,
            ":" + name + "_assets",
            ":" + name + "_client_bundle",
        ],
        root_paths = ["."],
        replace_prefixes = {
            name + "_assets_flat": "assets",
        },
        # `.map` files are useful for error reporting but not required at
        # runtime; keep them in dev (default), strip in step 13's OCI image.
        **forward_kwargs
    )

    # 8. Devserver — the same bundled Hono server we ship in prod, with
    # `PANELLET_STATIC_DIR` pointed at the runfiles static directory.
    # `ibazel_notify_changes` tells ibazel to send a SIGINT/restart cycle
    # to this binary on rebuild, so `ibazel run :{name}_devserver`
    # gives a hot server-restart loop. Process restart (not a worker
    # thread) keeps it dead simple; a worker-thread fast path is on the
    # explicit "out of scope for v1" list in the roadmap.
    devserver_kwargs = {k: v for k, v in forward_kwargs.items() if k != "tags"}
    devserver_tags = list(forward_kwargs.get("tags", []))
    if "ibazel_notify_changes" not in devserver_tags:
        devserver_tags.append("ibazel_notify_changes")
    js_binary(
        name = name + "_devserver",
        # Output file label of the esbuild rule; addressing the rule label
        # itself (`:{name}_server_bundle`) hits both `.js` and `.js.map`,
        # which js_binary rejects as "entry_point must be a single file".
        entry_point = ":" + name + "_server_bundle.js",
        data = [
            ":" + name + "_server_bundle",
            ":" + name + "_static",
        ],
        env = {
            "PANELLET_STATIC_DIR": "$(rootpath :{}_static)".format(name),
        },
        tags = devserver_tags,
        **devserver_kwargs
    )
