"React application macro with Starlark-defined routes and lazy loading"

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_run_binary")
load("//devtools/build/js:devserver.bzl", "devserver")
load(":asset_pipeline.bzl", "asset_pipeline")
load(":i18n_artifacts.bzl", "i18n_artifacts")
load(":labels.bzl", "ts_dep")
load(":react_app_manifest.bzl", "react_app_manifest")
load(":react_component.bzl", "react_component")
load(":route_tree.bzl", "route_objects", "walk_route_tree")
load(":runtime_config.bzl", "runtime_config_artifacts", "validate_runtime_config")
load(":bundle_outputs.bzl", "bundle_dir", "bundle_metafile")
load(":stylex_css.bzl", "stylex_css")

def route(path, component = None, children = None, error_component = None):
    """Define a route mapping a URL path to a react_component target.

    Args:
        path: URL path (e.g. "/", "about", ":city"). `"*"` is a catch-all
            (rendered when no other route matches — use for 404 pages).
        component: label of a react_component target (optional for grouping routes)
        children: list of nested route() dicts (optional)
        error_component: label of a react_component target rendered when this
            route (or any descendant without its own error_component) throws.
            Compiles to React Router's `errorElement`. The component is
            statically imported at the top of the generated router so it is
            available even when a lazy Component import fails.
    """
    r = {"path": path}
    if component:
        r["component"] = component
    if children:
        r["children"] = children
    if error_component:
        r["error_component"] = error_component
    return r

def react_app(name, layout, routes, browser_deps, error_component = None, jit_open_props = False, html_template = None, runtime_config = None, locales = None, source_locale = None, **kwargs):
    """Build a React application with Starlark-defined routes and lazy loading.

    Routes are defined in BUILD files and compiled to React Router's
    createBrowserRouter config with lazy() imports for per-route code splitting.
    Import paths are derived from each component target's DefaultInfo by
    looking up `{target_name}.js` — the same naming convention enforced by
    react_component's export-name test.

    Produces:
      - :{name}_devserver — dev server with unbundled ESM
      - :{name}_bundle — production esbuild bundle
      - :{name}_styles — collected StyleX CSS (transitive via
        stylex_metadata_aspect). Inlined into the documents below rather
        than served: it is a build input, not part of the webroot.
      - :{name}_html — production index.html, carrying the markup for `/`
        rendered at build time (see docs/adr/0013-build-time-prerender.md).
        Not rendered when `runtime_config` is set — those values do not
        exist until a deployment starts.
      - :{name}_prerender_bin — the renderer, run once per document
      - :{name}_env_tpl / :{name}_env_dev / :{name}_env_component — when
        `runtime_config` is set (see arg docs)

    Args:
        name: target name prefix
        layout: label of the root layout react_component (renders <Outlet />)
        routes: list of route() dicts (supports nesting)
        browser_deps: list of browser_dep labels for the devserver
        error_component: optional label of a react_component rendered when the
            layout or any route without its own error_component throws. Acts as
            the app-wide error boundary.
        html_template: optional custom HTML template (defaults to built-in)
        runtime_config: optional `{UPPER_SNAKE: dev_default}` dict declaring
            environment-specific string values (API_URL, feature flags) that
            differ across deployments without rebuilding the bundle. In prod,
            a `${KEY}`-templated `env.js` ships for envsubst-at-container-start;
            in dev the devserver synthesizes `env.js` from the defaults. App
            code depends on `:{name}_env_component` and imports a typed
            `getEnv` helper — undeclared keys fail `tsc`. See
            `runtime_config.bzl`.
        locales: optional list of locales the app supports (e.g. ["en", "es"]).
            When set, transitively collects every component's MF2 catalog
            fragments and emits a typed `{name}_i18n_manifest` component
            exposing `I18N_CATALOGS` + `Locale`. The merge step enforces that
            every non-source locale has the same key set as the source; the
            build fails on missing translations, stray keys, or cross-
            component collisions. When omitted, no i18n pipeline runs.
        source_locale: the authoritative locale; defaults to `locales[0]`.
            Other locales must satisfy this one's key contract exactly.
        **kwargs: passed through to downstream targets (e.g. visibility, tags)
    """

    # An app whose values arrive at runtime cannot be rendered at build time.
    # `runtime_config` exists precisely so a deployment can differ without a
    # rebuild, so `window.__ENV__` does not exist while the build runs and
    # the first `getEnv` during a prerender throws. Skipping is the honest
    # answer: the alternative is baking one deployment's values into markup
    # shipped to every deployment. Documents still build — `{{APP}}` just
    # resolves to nothing. See docs/adr/0013-build-time-prerender.md.
    prerender_enabled = runtime_config == None

    if runtime_config != None:
        validate_runtime_config(runtime_config)
        runtime_config_artifacts(
            name = name,
            runtime_config = runtime_config,
            forward_kwargs = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")},
        )

    # Flatten route tree: collect ordered component list and build
    # index-based route config for the manifest rule. Dedupe by label so a
    # component referenced in multiple routes (e.g. a shared error_component)
    # appears once — Bazel rejects duplicate labels in label_list attrs.
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

    # Dedupe across buckets too (layout / app-level error_component may
    # overlap with route components) before fan-out to downstream rules.
    seen = {}
    all_route_components = []
    for c in [layout] + ordered_components + ([error_component] if error_component else []):
        if c not in seen:
            seen[c] = True
            all_route_components.append(c)

    # When locales is set, walk the component closure via i18n_catalog_aspect,
    # merge fragments per locale, and emit :{name}_i18n_manifest for app code
    # to import. The merge step is where "catalog coverage is a build-time
    # invariant" actually holds — omit this block and that guarantee evaporates.
    i18n_enabled = bool(locales)
    _source_locale = source_locale if source_locale else (locales[0] if locales else None)
    if i18n_enabled:
        i18n_artifacts(
            name = name,
            components = all_route_components,
            source_locale = _source_locale,
            locales = locales,
            forward_kwargs = {k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")},
        )

    # Generate route manifest — looks up .js entries from each target's DefaultInfo
    manifest_name = name + "_manifest"
    react_app_manifest(
        name = manifest_name,
        layout = layout,
        layout_error_component = error_component,
        route_components = ordered_components,
        route_config = json.encode(flat_routes),
    )

    # Generate router.tsx and main.tsx from manifest. When i18n is enabled,
    # the generated main.tsx wraps <RouterProvider> in <I18nProvider> using
    # the per-app catalog manifest. Layout components stay clean — the wrap
    # lives here so that no user component has to import the manifest that's
    # built from its own fragments.
    codegen_name = name + "_codegen"
    codegen_args = [
        "--manifest",
        "$(location {}.json)".format(manifest_name),
        "--out-router",
        "$(location {}_router.tsx)".format(name),
        "--out-main",
        "$(location {}_main.tsx)".format(name),
    ]
    codegen_outs = [name + "_router.tsx", name + "_main.tsx"]
    if prerender_enabled:
        codegen_args += ["--out-prerender", "$(location {}_prerender.tsx)".format(name)]
        codegen_outs += [name + "_prerender.tsx", name + "_prerender_main.mjs"]
    if i18n_enabled:
        codegen_args.extend([
            "--i18n-manifest-import",
            "./" + name + "_i18n_manifest",
            # Stable npm package name — works in-monorepo and cross-repo because
            # @panellet/i18n-runtime is linked into //:node_modules/ via a
            # first-party npm_link_package in each consumer's root BUILD.
            "--i18n-runtime-import",
            "@panellet/i18n-runtime",
            "--i18n-source-locale",
            _source_locale,
        ])

    js_run_binary(
        name = codegen_name,
        srcs = [manifest_name + ".json"],
        outs = codegen_outs,
        args = codegen_args,
        tool = Label("//devtools/build/react_component:react_app_codegen_bin"),
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
    _main_deps = [
        ":" + name + "_router",
        "//:node_modules/react-dom",
        "//:node_modules/@types/react-dom",
        "//:node_modules/react-router",
    ]
    if i18n_enabled:
        _main_deps.extend([
            ":" + name + "_i18n_manifest",
            # Resolves to the consumer's //:node_modules/@panellet/i18n-runtime,
            # which they wire up via npm_link_package in their root BUILD.
            "//:node_modules/@panellet/i18n-runtime",
        ])
    react_component(
        name = name + "_main",
        srcs = [name + "_main.tsx"],
        _export_test = False,
        deps = _main_deps,
    )

    # Compile the generated prerender entry. Unlike `_main` it depends on the
    # route components directly rather than through the router: it imports
    # them statically, because a build-time render has no reason to defer a
    # module it is about to need.
    if prerender_enabled:
        _prerender_deps = all_route_components + [
            "//:node_modules/react-dom",
            "//:node_modules/@types/react-dom",
            "//:node_modules/react-router",
        ]
        if i18n_enabled:
            _prerender_deps.extend([
                ":" + name + "_i18n_manifest",
                "//:node_modules/@panellet/i18n-runtime",
            ])
        react_component(
            name = name + "_prerender",
            srcs = [name + "_prerender.tsx"],
            _export_test = False,
            deps = _prerender_deps,
        )

    # Collect StyleX CSS from all route components (transitive via stylex_metadata_aspect)
    stylex_css(
        name = name + "_styles",
        components = all_route_components,
        jit_open_props = jit_open_props,
    )

    # Copy open-props/normalize.min.css into a Bazel output so the HTML
    # generator can read it. Inlined ahead of the StyleX CSS: source order
    # gives it lower precedence than app styles.
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
        **{k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}
    )

    # Aggregate hashed static assets across all route components:
    #   :{name}_assets_flat  — flat TreeArtifact with all hashed files
    #   :{name}_assets.json  — devserver manifest (URL → filename)
    asset_pipeline(
        name = name + "_assets",
        components = all_route_components,
    )

    # Neither stylesheet is served as a file: both are inlined into every
    # document by the generator below. They were content-addressed under
    # `assets/` while they were render-blocking `<link>`s — the hash bought
    # the `immutable` header, which paid for the revalidation the link cost
    # before first paint. Inlining removes the request the whole arrangement
    # was built around: the bytes now arrive with the document that needs
    # them, one round trip instead of two, and there is no URL left to name
    # or to cache. See docs/adr/0012-inline-critical-css.md.
    #
    # The devserver reads these same two files and keeps linking them, so a
    # CSS edit there still reloads without rebuilding the document. Nothing
    # it serves is published.
    css_files = [":" + normalize_css_target, ":" + name + "_styles"]

    # HTML template
    tpl_name = html_template or Label("//devtools/build/react_component:index.html.tpl")

    # The metafile half of the bundle, so the generator can read the entry's
    # content-addressed name. Kept separate from what gets served — see
    # bundle_outputs.bzl.
    bundle_metafile(
        name = name + "_bundle_meta",
        bundle = ":" + name + "_bundle",
        **kwargs
    )

    # index.html is the last object on the render path with a fixed name, and
    # every name it points at is now a content hash — so none of them can be
    # substituted at analysis time the way this template once was. The
    # generator resolves them from esbuild's metafile and the stylesheet
    # manifest at action time.
    #
    # `type="module"` is required because the esbuild output uses ESM with
    # code-splitting (`splitting = True`): the entry statically imports the
    # shared vendor chunk and dynamically imports each lazy route chunk.
    # Classic `<script>` can't resolve those.
    html_args = [
        "--template",
        "$(location {})".format(tpl_name),
        "--metafile",
        "$(location :{}_bundle_meta)".format(name),
        # esbuild identifies outputs by their source entry point, and every
        # `lazy()` route is one too — the source path is what picks ours out.
        "--entry",
        "{}/{}_main.js".format(native.package_name(), name),
        # The TreeArtifact directory esbuild produces. react_static_layer
        # ships its contents at /var/www/html/{name}_bundle/ for the image
        # and at the same path in the bucket.
        "--bundle-dir",
        name + "_bundle",
    ]

    # Normalize is inlined before StyleX so source order keeps app styles
    # winning on equal specificity. This order is the cascade.
    for css_file in css_files:
        html_args += ["--css", "$(location {})".format(css_file)]

    # The layout renders on every path, so every document wants it early.
    # The router reaches it by dynamic import exactly as it reaches a route,
    # which is why the preload walk skipped it — and skipping it puts it on
    # the critical path, discovered only once the entry has run and itself
    # delaying the route beneath it.
    _layout = native.package_relative_label(layout)
    html_args += ["--layout-entry", "{}/{}.js".format(_layout.package, _layout.name)]

    # When runtime_config is set, the `/env.js` bootstrap must load before the
    # main bundle so `window.__ENV__` is set before any module script runs.
    if runtime_config != None:
        html_args.append("--env-script")

    html_srcs = [
        tpl_name,
        ":" + name + "_bundle_meta",
    ] + css_files

    # Each document carries the markup for the path it is served at, so the
    # arguments and inputs are per-document rather than shared. `_prerender`
    # targets are declared further down — Bazel resolves labels after the
    # package loads, so naming them here is not an ordering problem.
    def _document_args(out, app_html_target):
        args = ["--out", "$(location {})".format(out)] + html_args
        if prerender_enabled:
            args += ["--app-html", "$(location :{})".format(app_html_target)]
        return args

    def _document_srcs(app_html_target):
        return html_srcs + ([":" + app_html_target] if prerender_enabled else [])

    root_markup = name + "_prerender_root"

    # The index document is the `/` document — the bucket serves it there
    # through `main_page_suffix`, and it is the path most visitors arrive on.
    # `route_objects` leaves `/` out because no *separate* object is needed
    # for it, which is true of the file and false of the preload: this
    # document knows which route it will render just as surely as a route
    # document does, and until now was the only one that did not say so.
    root_route_args = []
    for r in routes:
        if r["path"] == "/" and r.get("component"):
            _c = native.package_relative_label(r["component"])
            root_route_args = ["--route-entry", "{}/{}.js".format(_c.package, _c.name)]

    js_run_binary(
        name = name + "_html",
        srcs = _document_srcs(root_markup),
        outs = [name + "_index.html"],
        args = _document_args(name + "_index.html", root_markup) + root_route_args,
        tool = Label("//devtools/build/react_component:html_codegen_bin"),
        **kwargs
    )

    # esbuild and devserver need _ts targets (which carry JsInfo)
    all_ts_targets = [ts_dep(c) for c in all_route_components]

    # --- Build-time prerender ------------------------------------------------
    # The route tree rendered to markup once, in Node, so a document arrives
    # with something contentful in it. Without this the body is an empty
    # `#root` and first paint cannot happen until the bundle has been
    # fetched, parsed and executed — on a throttled phone that is the whole
    # of FCP. See docs/adr/0013-build-time-prerender.md.
    #
    # Bundled rather than run from the compiled tree because this executes
    # in Node against first-party ESM plus npm packages, and one esbuild
    # pass settles every resolution at build time instead of at run time.
    # Renders `path` into `out`. A no-op when the app opts out above, so the
    # route loop below does not have to know which mode it is in.
    def _prerender(target, out, path):
        if not prerender_enabled:
            return
        js_run_binary(
            name = target,
            outs = [out],
            args = ["--path", path, "--out", "$(location {})".format(out)],
            tool = ":" + name + "_prerender_bin",
            **kwargs
        )

    if prerender_enabled:
        esbuild(
            name = name + "_prerender_bundle",
            # The .mjs wrapper, not the .tsx's output: the render module is
            # kept free of Node APIs so it type-checks under the same tsconfig
            # as every other component, and the file I/O lives beside it in
            # plain JS that tsc never reads.
            entry_point = name + "_prerender_main.mjs",
            srcs = [name + "_prerender_main.mjs"],
            # Node, not the browser: `react-dom/server` and `node:fs` both
            # resolve differently, and nothing here is ever shipped.
            platform = "node",
            target = "node20",
            # No minify. Nothing downloads this, so the only thing shrinking
            # it would cost is a readable stack trace when a component throws
            # mid-render — which is the one output this bundle has to be good
            # at producing.
            config = Label("//devtools/build/react_component:esbuild_prerender.config"),
            deps = [
                ":" + name + "_prerender_ts",
            ] + all_ts_targets + [
                "//:node_modules/react",
                "//:node_modules/react-dom",
                "//:node_modules/react-router",
                "//:node_modules/@stylexjs/stylex",
            ],
            **kwargs
        )

        # The bundle target carries its sourcemap too, so the binary names
        # the one file rather than the target.
        js_binary(
            name = name + "_prerender_bin",
            entry_point = ":" + name + "_prerender_bundle.js",
            **kwargs
        )

    # The root document answers `/` through the bucket's `main_page_suffix`,
    # and is also the shell the URL map serves under a 404 — so it is
    # rendered at `/`, the one path it is certain to be showing.
    _prerender(root_markup, name + "_app.html", "/")

    # Production bundle. Asset files ride as data so they end up in the
    # bundle's runfiles; URLs are baked into JS by asset_codegen, so
    # esbuild doesn't need to see the binaries directly.
    #
    # Target es2020 so BigInt literals (e.g. messageformat's `100n`) and
    # optional chaining compile as-is. Our tsconfig targets ES2022, and
    # every browser we support has shipped these features since 2020.
    #
    # The esbuild `config` aliases `react` etc. to the consumer's
    # //:node_modules/react. See the config file for rationale — without
    # this, cross-repo npm_package linkages (e.g. @panellet/i18n-runtime
    # from @senku) bundle a second react copy from their own virtual
    # store path, breaking React's hook dispatcher at runtime.
    #
    # `splitting = True` switches the output to ESM + a directory of chunks:
    #   {name}_main.js       — the entry; the HTML loads this as `type="module"`
    #   chunk-<hash>.js      — shared deps (react, react-dom, messageformat, …)
    #                          auto-extracted because every lazy route chunk
    #                          imports them. Cached across deploys until those
    #                          packages change.
    #   <Route>-<hash>.js    — each react-router `lazy()` route; fetched on nav,
    #                          cached until that route's source changes.
    # Preserves tree-shaking end-to-end (one esbuild pass sees all imports).
    esbuild(
        name = name + "_bundle",
        entry_point = name + "_main.js",
        target = "es2020",
        splitting = True,
        output_dir = True,
        # The entry's name carries a content hash (see the esbuild config), so
        # nothing can know it at analysis time. The metafile is how the HTML
        # generator learns it. It is declared as a *sibling* of the output
        # directory rather than inside it, which is what lets the servable
        # filegroup below leave it out by construction — it must never reach
        # the bucket, since it holds the whole module graph and every input
        # path. See docs/adr/0010-content-addressed-webroot.md.
        metafile = True,
        # Ship production-mode JS. `define` rewrites the classic
        # `process.env.NODE_ENV` guards (react-dom, scheduler, etc. still
        # use them) so minify can dead-code the dev-only branches. The
        # `production` export condition that swaps react.development.js for
        # its production twin lives in the esbuild config (next to the
        # react alias — two sides of the same "one canonical react" story).
        define = {"process.env.NODE_ENV": '"production"'},
        minify = True,
        config = Label("//devtools/build/react_component:esbuild_react_dedup.config"),
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
        css = css_files,
        assets_manifest = ":" + name + "_assets.json",
        assets_dir = ":" + name + "_assets",
        runtime_config_dev = (":" + name + "_env_dev") if runtime_config != None else None,
        **kwargs
    )

    # Aggregate the deployable prod outputs under the bare `:{name}` label
    # so `bazel build :{name}` produces everything a static host would serve,
    # and downstream macros (e.g. react_static_layer) can consume the app
    # as a single Bazel label instead of a string prefix.
    # A client-side route is only a 200 if the bucket holds an object at that
    # path — object existence is the whole of a bucket's routing. So each
    # declared route gets a copy of the entry document, and everything not
    # declared falls to the URL map's fallback, which serves the shell under
    # a 404. That keeps the route table in the build, where it is declared,
    # rather than in a URL map shared by every host.
    #
    # `{path}/index.html` rather than a bare `{path}`: the bucket's
    # `main_page_suffix` resolves the directory form, and an extensionless
    # object would be stamped `application/octet-stream` by the closed
    # content-type table — a download prompt instead of a page.
    #
    # Each is rendered rather than copied, because a route's document knows
    # which route it serves and can say so: it preloads that route's chunk,
    # which the entry reaches only by dynamic import and no client can
    # discover until the router asks for it. That only helps a direct hit —
    # navigating there in-app never fetches this document — but a direct hit
    # is the first impression.
    route_documents = []
    for entry in route_objects(routes):
        # The path goes into the target name unaltered. Bazel target names
        # admit both `-` and `/`, and folding either into `_` would make the
        # mapping lossy — `a-b`, `a_b` and `a/b` would all become one name
        # and collide as duplicate targets.
        route_target = "{}_route_{}".format(name, entry.path)

        # Rendered at its own path, so a direct hit on a route gets that
        # route's markup rather than the index's.
        route_markup = "{}_prerender_{}".format(name, entry.path)
        _prerender(route_markup, entry.path + "/app.html", "/" + entry.path)

        route_args = _document_args(entry.path + "/index.html", route_markup)

        # A route that only groups children has no component of its own, so
        # there is no chunk to name and it renders exactly like the entry
        # document. esbuild identifies the chunk by the component's source
        # path, which react_component fixes as `{package}/{target}.js`.
        if entry.component:
            component = native.package_relative_label(entry.component)
            route_args += ["--route-entry", "{}/{}.js".format(component.package, component.name)]

        js_run_binary(
            name = route_target,
            srcs = _document_srcs(route_markup),
            outs = [entry.path + "/index.html"],
            args = route_args,
            tool = Label("//devtools/build/react_component:html_codegen_bin"),
            **kwargs
        )
        route_documents.append(":" + route_target)

    # The bundle enters as `:{name}_bundle_dir`, not `:{name}_bundle`. The
    # esbuild target also carries the metafile, and everything named here is
    # served from a public bucket — see bundle_dir.bzl.
    bundle_dir(
        name = name + "_bundle_dir",
        bundle = ":" + name + "_bundle",
        **kwargs
    )

    native.filegroup(
        name = name,
        srcs = [
            ":" + name + "_html",
            ":" + name + "_bundle_dir",
            ":" + name + "_assets",
        ] + route_documents,
        **kwargs
    )
