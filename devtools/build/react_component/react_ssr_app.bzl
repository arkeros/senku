"""SSR React application macro — Hono Node server, single-process OCI image.

Mirrors `react_app` for the SPA case: same Starlark-defined route tree,
same StyleX/i18n/asset pipelines, same `runtime_config`/`locales` arguments.
Differs at the runtime layer — the prod image is a distroless-Node Hono
server that renders HTML per request and serves the bundle/asset files
itself, and the devserver is the same Hono process restarted by ibazel
on rebuild rather than a static-file server with import maps.

This file is the v1 skeleton: it validates inputs and reuses
`react_app`'s codegen so existing example apps can be flipped over without
behavior changes. Subsequent commits in the SSR roadmap (`docs/panellet-
ssr-roadmap.md`) layer on the dual-compile, server bundle, streaming SSR,
preload/meta wiring, locale negotiation, and the `react_ssr_layer` OCI
image. Behavior surfaced to users today is a strict subset of what
`react_app` ships; SSR-only knobs (e.g. server-only deps) will land
alongside their backing implementation.
"""

load(":runtime_config.bzl", "validate_runtime_config")

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
    """Build an SSR React application — Hono Node server, single-process OCI image.

    Args mirror `react_app` (see `react_app.bzl` for full docs); semantic
    differences land alongside the implementation in subsequent commits:
      - `runtime_config` will read from `process.env` at server boot rather
        than via envsubst-at-container-start.
      - `locales` will negotiate per-request (`?lang=` → cookie →
        Accept-Language → `source_locale`) on the server instead of on the
        client.
      - Route component files may export `preload` and `meta`; the dual-
        compile transform strips them from the client bundle.

    The v1 skeleton validates inputs and emits no targets; downstream rules
    (server bundle, devserver, OCI image) are added in the roadmap's
    later steps.

    Args:
        name: target name prefix.
        layout: label of the root layout react_component (renders <Outlet />).
        routes: list of route() dicts; supports nesting.
        browser_deps: list of browser_dep labels for client-side modules.
        error_component: optional app-wide error react_component.
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

    # Subsequent roadmap steps consume layout/routes/browser_deps/etc. to
    # generate the codegen, server bundle, and devserver targets. The v1
    # skeleton intentionally produces nothing so the macro can be loaded
    # and exercised by a smoke test before any of those rules exist.
    _ = (layout, routes, browser_deps, error_component, jit_open_props, html_template, runtime_config, locales, source_locale, kwargs)  # buildifier: disable=unused-variable
