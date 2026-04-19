"React application macro with Starlark-defined routes and lazy loading"

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@bazel_lib//lib:expand_template.bzl", "expand_template")
load("//devtools/build/js:devserver.bzl", "devserver")
load(":asset_pipeline.bzl", "asset_pipeline")
load(":i18n_artifacts.bzl", "i18n_artifacts")
load(":labels.bzl", "ts_dep")
load(":react_app_manifest.bzl", "react_app_manifest")
load(":react_component.bzl", "react_component")
load(":route_tree.bzl", "walk_route_tree")
load(":runtime_config.bzl", "runtime_config_artifacts", "validate_runtime_config")
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
            # @panallet/i18n-runtime is linked into //:node_modules/ via a
            # first-party npm_link_package in each consumer's root BUILD.
            "--i18n-runtime-import",
            "@panallet/i18n-runtime",
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
            # Resolves to the consumer's //:node_modules/@panallet/i18n-runtime,
            # which they wire up via npm_link_package in their root BUILD.
            "//:node_modules/@panallet/i18n-runtime",
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

    # Aggregate hashed static assets across all route components:
    #   :{name}_assets_flat  — flat TreeArtifact with all hashed files
    #   :{name}_assets.json  — devserver manifest (URL → filename)
    asset_pipeline(
        name = name + "_assets",
        components = all_route_components,
    )

    # HTML template
    tpl_name = html_template or Label("//devtools/build/react_component:index.html.tpl")

    # When runtime_config is set, the `/env.js` bootstrap must load before the
    # main bundle so `window.__ENV__` is set before any module script runs.
    env_script_tag = '<script src="/env.js"></script>' if runtime_config != None else ""
    expand_template(
        name = name + "_html",
        out = name + "_index.html",
        substitutions = {
            "{{HEAD}}": '<link rel="stylesheet" href="/{}_styles.css" />'.format(name),
            "{{SCRIPTS}}": '{}<script src="/{}_bundle.js"></script>'.format(env_script_tag, name),
        },
        template = tpl_name,
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
    esbuild(
        name = name + "_bundle",
        entry_point = name + "_main.js",
        target = "es2020",
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
        css = ":" + name + "_styles",
        assets_manifest = ":" + name + "_assets.json",
        assets_dir = ":" + name + "_assets",
        runtime_config_dev = (":" + name + "_env_dev") if runtime_config != None else None,
        **kwargs
    )
