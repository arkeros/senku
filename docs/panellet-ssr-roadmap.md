# Panellet SSR — implementation roadmap

Design context: see [ADRs 0001–0005](./adr/) and [panellet-CONTEXT.md](./panellet-CONTEXT.md).

Increments are along feature/behavior axes (TDD red-green per `feedback_tdd_incremental_refactors.md`), not along implementation-difficulty axes. Each step ships in its own commit (or small commit chain) and leaves the tree green.

## Steps

1. **`react_ssr_app` macro skeleton.** New `react_ssr_app.bzl` alongside `react_app.bzl`. Macro accepts the same args as `react_app` plus future SSR-only ones. Generates no real targets yet — just validates inputs and exists. A no-op smoke test confirms the macro loads.

2. **Babel dual-compile transform + tests.** New transform that, given a `.tsx` source, produces `.client.js` (with `preload` and `meta` named exports stripped + dead imports swept) and `.server.js` (full module). Standalone tests on the transform first; no integration with `react_component` yet.

3. **`react_component` extension: detect server-only exports.** Pre-parse pass detects `preload`/`meta` named exports; when present, runs the dual-compile and emits both outputs. Existing single-output behavior preserved when neither is present (no regression for `react_app`).

4. **Server bundle target.** New `react_ssr_app` produces a server-bundle esbuild target whose entry is a generated `{name}_server.tsx` — for now it's a hand-written stub that imports Hono and serves static "Hello" HTML. Verifies bundling-everything works (React, Hono, etc., all in one file).

5. **Hono dev/prod server with static-file serving.** Hono server serves the prod assets (bundle chunks, CSS, hashed assets) for non-route URLs, with a SPA-fallback-style catch-all that currently still returns the stub HTML for any URL. ibazel `--restart_command` wires up dev mode (process restart on rebuild). Devserver target works.

6. **`createStaticHandler` + `renderToPipeableStream`.** Generated `{name}_server.tsx` calls `createStaticHandler(routes)`, runs the matched-route chain, pipes `renderToPipeableStream(<StaticRouterProvider .../>)` to the Hono response. Routes render real React-produced HTML server-side. No `preload`, no `meta`, no `route.lazy` yet — just streaming SSR of the existing component tree. **The spike.**

7. **`route.lazy` switch + modulepreload.** Codegen replaces `React.lazy()` with `route.lazy` in the generated client router. Server-side bundle still imports all routes statically. Server emits `<link rel="modulepreload">` tags in `<head>` for the matched route's chunks (derived from `createStaticHandler`'s match output).

8. **`preload` flow.** `react_component`'s detected `preload` export is wired into `route.lazy`'s return shape (panellet's `preload` translates to react-router's `loader`). Server awaits the loader, framework injects result into the component as **props** (thin `<RouteWithProps loader={loader} />` wrapper). Hydration data island emits `{hydration: superjson(loaderData)}`; client bootstrap parses it and `<RouterProvider>` reads it on hydrate.

9. **`meta` flow.** `react_component`'s detected `meta` export runs after `preload`; framework collects matched-chain meta (deeper wins per-key, shallow defaults), emits `<title>` / `<meta>` tags into the streamed `<head>` shell. React 19's `<title>` hoisting works alongside automatically — no extra wiring needed for the interactive-leaf escape hatch.

10. **`runtime_config` rewire.** `runtime_config_artifacts` macro for `react_ssr_app` no longer emits `_env_tpl` or `_env_dev` — server reads `process.env` at boot (validated against the declared key set), populates `globalThis.__ENV__`, inlines `{env: {...}}` into the data island. Client bootstrap parses the env from the island into `window.__ENV__` *before* the main bundle script runs. Single `getEnv(key)` reads `globalThis.__ENV__`, works identically server and client. Delete the envsubst path from `react_static_layer` for `react_ssr_app` — `react_app` is unchanged.

11. **Locale negotiation.** New `pickServerLocale({request, supported, fallback})` helper in `i18n_runtime`: priority `?lang=` → `lang` cookie → `Accept-Language` (q-weighted) → `source_locale`. When `?lang=` seen, server `Set-Cookie`s the value. Picked locale + its catalog inlined into data island as `{locale: "es", catalog: {...}}`. Client `pickLocale()` replaced by `readLocaleFromDocument()` in the codegen-generated entry.

12. **Error handling.** Document the `throw new Response(...)` / `throw redirect(url)` model. `createStaticHandler`'s error context propagates: thrown Response → matching HTTP status; thrown Error → status 500 + `errorComponent` render. Re-export `redirect()` from `@panellet/server` for ergonomic imports. Add lint/Babel guard: `errorComponent` must not export `preload` (footgun prevention).

13. **`react_ssr_layer` + OCI image.** New macro emits two tars: `_server` (`/app/server.js`) + `_assets` (`/app/assets/...`). New `ssr_image.bzl` produces a distroless-Node OCI image with `node /app/server.js` as entrypoint, exposes `PORT` env var (default 8080), `/healthz` endpoint. `frontend_image.bzl` (nginx-based) is unchanged — used only by `react_app`.

14. **Migrate an example onto `react_ssr_app`.** Either flip `examples/stylex/` to `react_ssr_app` (validates the migration story) or add a new `examples/ssr/` (validates the demo-of-both story). Demonstrate `preload`, `meta`, `runtime_config`, locale, and at least one `throw redirect` / `throw new Response(404)`.

## Out of scope for v1 (revisit when needed)

- **SSG-per-route** (build-time pre-render for static pages). Adds `static = True` on `route()`, build-time render action per static route, request-time "is this URL pre-rendered? else SSR." Useful optimization, not blocking.
- **Forms / actions** (POST handlers, `<Form method="post">`, redirect-after-POST). Particularly hostile to Relay's `commitMutation` model — defer until we have a clear non-Relay form story.
- **`defer()` / streaming-after-shell.** Today everything blocks on preloads. Revisit when a real route has a fast-vs-slow data split worth streaming separately.
- **Worker-thread dev reload** (faster than process restart). Optimization to v1.5 if 1–3s restart latency stings in practice.
- **URL-prefix locale routing** (`/es/about`). Separate v2 design conversation.
- **RSC.** Off the table for v1; would require esbuild RSC support and re-classifying every existing component as client.

## Cross-repo follow-up

`docs/panellet-cross-repo.md` will need updates once `react_ssr_app` ships — new server-side runtime deps to declare via `npm_link_package`, possible extraction of `@panellet/server` for the Hono helpers (e.g., re-exported `redirect()`, `pickServerLocale`).
