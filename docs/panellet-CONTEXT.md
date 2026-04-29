# Panellet

Bazel-native React framework: Starlark-defined routes, build-time StyleX CSS extraction, hermetic dev/prod pipeline. Exists to demonstrate how much of the JS build/dev/prod story can live inside Bazel rather than in runtime tooling (Vite, Next, Remix framework mode).

## Language

### App-shape macros

**`react_app`**:
SPA (no SSR) panellet app — esbuild bundle behind nginx, native-ESM devserver.
_Avoid_: "SPA app", "panellet app" (ambiguous with SSR).

**`react_ssr_app`**:
SSR panellet app — Hono Node server renders HTML per request, single-process OCI image, dev devserver also SSRs (process-restarted on rebuild).
_Avoid_: "SSR app", "Node app".

**`route`**:
Starlark function declaring a URL path → component mapping; supports nesting, `error_component`, and (under `react_ssr_app`) `entrypoint`-shaped data via `preload`/`meta` exports on the route component file.
_Avoid_: "page" (ambiguous), "screen".

### Route concepts

**Route component**:
The `react_component` target referenced by a `route()`'s `component` field; renders the page body for that path.
_Avoid_: "page component", "view".

**Layout**:
The root `react_component` wrapping all routes; renders `<Outlet />` for the matched route to slot into.
_Avoid_: "shell", "wrapper", "frame".

**Error component**:
A `react_component` rendered when its route (or any descendant without its own `error_component`) throws; compiles to react-router's `errorElement`.
_Avoid_: "fallback", "error boundary".

**Entrypoint**:
The (`Component` + `preload` + `meta`) bundle declared together on a route component file; conceptually a Relay-style Entrypoint that the server awaits before render and the client lazy-imports per `route.lazy`.
_Avoid_: "loader", "page bundle".

**`preload`**:
Named export on a route component file (`async ({request, params}) => data`); server-only, runs before render, return value becomes the component's **props**. Implemented underneath as react-router's `loader` with prop-injection on top.
_Avoid_: "loader" (the underlying mechanism, not the panellet API), "fetcher", "data function".

**`meta`**:
Named export on a route component file (`({data, request, params}) => MetaObject`); server-only, runs after `preload`, return value becomes per-route `<head>` content (title, description, OG tags). The interactive-leaf escape hatch is React 19's built-in `<title>` JSX hoisting.
_Avoid_: "head", "headData".

### Build-pipeline concepts

**Dual-compile**:
Custom Babel transform that produces both `.client.js` (with `preload`/`meta` exports stripped + dead imports swept) and `.server.js` (full module) from one route component `.tsx`; runs as two parallel Bazel actions.
_Avoid_: "tree-shake the route file", "split build".

**Server bundle**:
The single esbuild artifact loaded by Hono in dev and prod; statically imports every route's `.server.js`, plus the generated router and entry. Bundle-everything (no externalized `node_modules`).
_Avoid_: "Node bundle".

**Client bundle**:
The esbuild artifact loaded by browsers in prod (`{name}_main.js` + shared chunk + per-route lazy chunks). In dev, replaced by raw `.client.js` files served over native ESM with import maps — no bundling step in the dev loop.
_Avoid_: "browser bundle" (ambiguous with `browser_dep`).

**Data island**:
A `<script type="application/json" id="__panellet__">` block emitted by the SSR server in every HTML response, carrying `{env, locale, hydration}`. Replaces the previous `/env.js` + envsubst mechanism for runtime config.
_Avoid_: "bootstrap script", "init data".

**`route.lazy`**:
React-router's lazy route loading API (`{path, lazy: async () => ({Component, ...})}`); panellet's codegen emits this — *not* `React.lazy()` — so `createStaticHandler` can await matched routes before render.
_Avoid_: "lazy import", "code-split route".

**`runtime_config`**:
The mechanism for per-deployment string values (API URLs, feature flags); `react_ssr_app` reads them from `process.env` at server boot and ships them in the data island. The typed `getEnv(key)` helper reads `globalThis.__ENV__` and works identically server-side and client-side.
_Avoid_: "env vars" (too generic), "config".

**`browser_dep` / `browser_dep_group`**:
Bazel rules that prepare npm packages for browser consumption (CJS→ESM conversion, ESM manifest generation); shared targets in `//devtools/build/js`. Used by both `react_app` and `react_ssr_app` for client-side dependencies.
_Avoid_: "browser package".

**Devserver**:
The Bazel-runnable local server. For `react_app`: a static-file server with import maps. For `react_ssr_app`: a Hono SSR process-restarted by ibazel on rebuild.
_Avoid_: "dev server" (informal), "local server".

**Frontend image**:
The OCI image. For `react_app`: nginx + static layers (`react_static_layer`). For `react_ssr_app`: distroless-Node + server bundle layer + assets layer (`react_ssr_layer`).
_Avoid_: "container image" (general), "deploy image".

## Relationships

- A **`react_ssr_app`** declares a **layout** + a list of **routes** + (optionally) `runtime_config` and `locales`.
- A **route** maps a URL path to a **route component** (and optionally an **error component**); routes nest.
- A **route component** is a `react_component` whose source file may export **`preload`** and **`meta`** (server-only).
- The **dual-compile** Babel transform produces `.client.js` and `.server.js` from each route component `.tsx`.
- The **server bundle** statically imports every route component's `.server.js`; the **client bundle** uses **`route.lazy`** to dynamically import each route component's `.client.js` chunk.
- The **devserver** for `react_ssr_app` runs the server bundle directly; the client side serves `.client.js` files over native ESM (no client bundle in dev).
- The **frontend image** for `react_ssr_app` packages the server bundle + assets into a distroless-Node OCI image (`react_ssr_layer`).
- **`runtime_config`** values flow from `process.env` → server boot → **data island** in HTML → `globalThis.__ENV__` (server: at boot; client: parsed from data island before bundle script runs) → typed `getEnv(key)` reads.

## Example dialogue

> **Dev**: "I want this route to fetch the current user before rendering. Where does that go?"
> **Panellet maintainer**: "Add a `preload` named export to the route component file. It receives `{request, params}` and returns whatever the component needs as props — no `useLoaderData`. The component file becomes the **entrypoint** for that route. The Babel **dual-compile** strips `preload` from the client bundle automatically, so colocating server code is safe."

> **Dev**: "What about the page title? My title depends on the user's name from preload."
> **Panellet maintainer**: "Add a `meta` named export — same file, runs after `preload`, gets the preloaded data. For an interactive case where a leaf component needs to update the title at runtime (a game countdown, say), use React 19's `<title>` JSX in the leaf and let React hoist it."

> **Dev**: "And if the user isn't logged in?"
> **Panellet maintainer**: "From `preload`, `throw redirect('/login')`. react-router's throw-Response model — same pattern for 404s (`throw new Response(null, {status: 404})`) — and the status propagates through Hono to the HTTP response."

## Flagged ambiguities

- **"loader"** — used in react-router's API for what panellet exposes as **`preload`**. Inside the panellet implementation, react-router's loader is what `preload` translates to under the hood, but in panellet user code and docs, always say "preload."
- **"page"** — overloaded between "URL", "route component", "rendered HTML", and "user mental model of a screen." Resolve by saying **route**, **route component**, or **HTML response** as appropriate.
- **"bundle"** — ambiguous between **server bundle** (one file, Hono-loaded) and **client bundle** (main + chunks, browser-loaded). Always qualify.
- **"env"** — `runtime_config` (per-deployment string values, accessed via `getEnv`) vs. build-time defines (`process.env.NODE_ENV` substituted at esbuild time) are distinct mechanisms. When discussing one, name it.
