"React application macro with Starlark-defined routes and lazy loading"

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("//devtools/build/js:devserver.bzl", "devserver")
load(":asset_pipeline.bzl", "asset_pipeline")
load(":i18n_artifacts.bzl", "i18n_artifacts")
load(":labels.bzl", "ts_dep")
load(":react_app_manifest.bzl", "react_app_manifest")
load(":react_component.bzl", "react_component")
load(":route_tree.bzl", "route_url_paths", "walk_route_tree")
load(":runtime_config.bzl", "runtime_config_artifacts", "validate_runtime_config")
load(":_hash_assets.bzl", "hash_assets")
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
      - :{name}_styles — collected StyleX CSS (transitive via stylex_metadata_aspect)
      - :{name}_html — production index.html
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
        outs = [name + "_router.tsx", name + "_main.tsx"],
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

    # Collect StyleX CSS from all route components (transitive via stylex_metadata_aspect)
    stylex_css(
        name = name + "_styles",
        components = all_route_components,
        jit_open_props = jit_open_props,
    )

    # Copy open-props/normalize.min.css into a Bazel output so it lands in
    # the app filegroup (and therefore the prod tar layer). Shipped as a
    # sibling stylesheet loaded before StyleX CSS: source order gives it
    # lower precedence than app styles, and keeping it a separate file
    # lets the browser cache the normalize bytes across deploys — they
    # only change on open-props version bumps, not on component edits.
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

    # Both stylesheets are render-blocking `<link>`s, so a stable name costs
    # a revalidation before first paint on every visit. Content-addressing
    # them buys the `immutable` policy — and lands them under `assets/`,
    # which is what earns it: cache.bzl marks that prefix immutable, so the
    # hash and the header cannot disagree. The devserver keeps reading the
    # unhashed pair below; nothing it serves is published.
    css_hashed_target = name + "_css_hashed"
    hash_assets(
        name = css_hashed_target,
        srcs = [":" + name + "_styles", ":" + normalize_css_target],
    )

    # The tree alone. `hash_assets` returns the manifest in the same
    # DefaultInfo, and everything in the servable filegroup below is
    # published — same hazard as the esbuild metafile, but this rule offers
    # an output group, so selecting the servable half needs no new rule.
    native.filegroup(
        name = name + "_css_dir",
        srcs = [":" + css_hashed_target],
        output_group = "assets",
        **kwargs
    )

    # The manifest half, for the HTML generator. Never served.
    css_manifest_target = name + "_css_manifest"
    native.filegroup(
        name = css_manifest_target,
        srcs = [":" + css_hashed_target],
        output_group = "asset_manifest",
        **kwargs
    )

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
        "--out",
        "$(location {}_index.html)".format(name),
        "--metafile",
        "$(location :{}_bundle_meta)".format(name),
        "--css-manifest",
        "$(location :{})".format(css_manifest_target),
        # esbuild identifies outputs by their source entry point, and every
        # `lazy()` route is one too — the source path is what picks ours out.
        "--entry",
        "{}/{}_main.js".format(native.package_name(), name),
        # The TreeArtifact directory esbuild produces. react_static_layer
        # ships its contents at /var/www/html/{name}_bundle/ for the image
        # and at the same path in the bucket.
        "--bundle-dir",
        name + "_bundle",
        # Normalize ships before StyleX so source order keeps app styles
        # winning on equal specificity. This order is the cascade.
        "--css",
        name + "_normalize.css",
        "--css",
        name + "_styles.css",
    ]

    # When runtime_config is set, the `/env.js` bootstrap must load before the
    # main bundle so `window.__ENV__` is set before any module script runs.
    if runtime_config != None:
        html_args.append("--env-script")

    js_run_binary(
        name = name + "_html",
        srcs = [
            tpl_name,
            ":" + name + "_bundle_meta",
            ":" + css_manifest_target,
        ],
        outs = [name + "_index.html"],
        args = html_args,
        tool = Label("//devtools/build/react_component:html_codegen_bin"),
        **kwargs
    )

    # esbuild and devserver need _ts targets (which carry JsInfo)
    all_ts_targets = [ts_dep(c) for c in all_route_components]

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
        css = [":" + normalize_css_target, ":" + name + "_styles"],
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
    route_objects = []
    for url_path in route_url_paths(routes):
        route_target = "{}_route_{}".format(name, url_path.replace("/", "_").replace("-", "_"))
        native.genrule(
            name = route_target,
            srcs = [":" + name + "_html"],
            outs = [url_path + "/index.html"],
            cmd = "cp $(location :{}_html) $@".format(name),
            **{k: v for k, v in kwargs.items() if k in ("visibility", "tags", "testonly")}
        )
        route_objects.append(":" + route_target)

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
            ":" + name + "_css_dir",
            ":" + name + "_assets",
        ] + route_objects,
        **kwargs
    )
