# Panallet — React + StyleX Framework for Bazel

Panallet is a Bazel-native framework for building React applications with StyleX.
Routes are defined in Starlark, components are compiled with Babel, and the dev
server serves native ES modules with import maps.

## Architecture

```
BUILD files (Starlark)
    │
    ├── react_component   ── Babel ──► .js + .js.map + .stylex.json
    │                           │
    │                         tsc ──► .d.ts (type-checking, parallel)
    │
    ├── react_app         ── codegen ──► router.tsx + main.tsx
    │                           │
    │                      json.encode() route manifest
    │
    ├── stylex_css        ── collect ──► styles.css
    │                           │
    │                      processStylexRules(metadata)
    │
    ├── esbuild           ── bundle ──► bundle.js (production)
    │
    └── devserver         ── serve  ──► import maps + native ESM (development)
```

## Quick Start

### Define components

```python
# //my/app/BUILD
load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Button",
    srcs = ["Button.tsx"],
)
```

`react_component` is a macro that:
- Transpiles `.tsx` via Babel (TypeScript + JSX + StyleX in one pass)
- Type-checks via `tsc` in a parallel action
- Emits `.js`, `.js.map`, `.d.ts`, and `.stylex.json` (CSS metadata)

Framework deps (`react`, `@stylexjs/stylex`, `@types/react`) are included automatically.

### Define routes

```python
# //my/app/BUILD
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")

react_app(
    name = "app",
    layout = ":Layout",
    routes = [
        route(path = "/", component = "//my/app/pages:Home"),
        route(path = "about", component = "//my/app/pages:About"),
        route(
            path = "concerts",
            children = [
                route(path = "/", component = "//my/app/pages/concerts:ConcertsHome"),
                route(path = ":city", component = "//my/app/pages/concerts:City"),
                route(path = "trending", component = "//my/app/pages/concerts:Trending"),
            ],
        ),
    ],
    browser_deps = [
        "//devtools/build/js:react",
        "//devtools/build/js:react_jsx_runtime",
        "//devtools/build/js:react_dom_client",
        "//devtools/build/js:react_router",
        "//devtools/build/js:stylex",
    ],
)
```

`react_app` generates all downstream targets from the route definitions:
- `:app_devserver` — dev server
- `:app_bundle` — production esbuild bundle
- `:app_styles` — collected StyleX CSS
- `:app_html` — production index.html

### Run

```bash
# Development (native ESM, no bundling)
bazel run //my/app:app_devserver

# Development with watch mode
ibazel run //my/app:app_devserver

# Production bundle
bazel build //my/app:app_bundle
```

## How It Works

### Component Compilation

Each `.tsx` file is compiled by a custom Babel script (`stylex_transpile.mjs`) that
runs `@babel/core` with three plugins in a single pass:

1. **`@babel/preset-typescript`** — strips type annotations
2. **`@babel/preset-react`** — compiles JSX (automatic runtime → `react/jsx-runtime`)
3. **`@stylexjs/babel-plugin`** — compiles `stylex.create()` to atomic CSS class names

Output per file:
- `.js` — transpiled ES module
- `.js.map` — source map
- `.stylex.json` — CSS metadata (array of `[hash, {ltr, rtl?}, priority]` tuples)

TypeScript type-checking (`tsc`) runs as a separate parallel Bazel action via
`ts_project`. It produces `.d.ts` files and catches type errors without blocking
the JS transpilation.

### StyleX CSS Extraction

`stylex_css` collects `.stylex.json` metadata files from all components and calls
`@stylexjs/babel-plugin`'s `processStylexRules()` to generate a single CSS file
with atomic class definitions:

```css
.x17jyzoo:not(#\#):not(#\#){background-color:royalblue}
.x1awj2ng:not(#\#):not(#\#){color:white}
.x1j61zf2:not(#\#):not(#\#){font-size:16px}
```

The CSS is extracted at build time — no runtime CSS-in-JS overhead.

### Route Code Generation

`react_app` uses `json.encode()` to serialize the route tree to a JSON manifest,
then runs a codegen script that generates:

**`router.tsx`** — React Router `createBrowserRouter` config:
```tsx
import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "about", Component: About },
    ],
  },
]);
```

**`main.tsx`** — entry point:
```tsx
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app_router";

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
```

Target names match file names — `":Home"` → `import { Home } from "./Home"`.
Cross-package labels are resolved to relative paths automatically:
`"//my/app/pages:About"` → `"./pages/About"`.

### Nested Routes and Parameters

Routes support arbitrary nesting and URL parameters:

```python
route(
    path = "concerts",
    children = [
        route(path = "/", component = "//pages/concerts:ConcertsHome"),
        route(path = ":city", component = "//pages/concerts:City"),
        route(path = "trending", component = "//pages/concerts:Trending"),
    ],
)
```

The `:city` parameter is available via `useParams()` in the component:

```tsx
import { useParams } from "react-router";

export function City() {
  const { city } = useParams();
  return <h1>Concerts in {city}</h1>;
}
```

### Dev Server

The dev server (`devserver.mjs`) serves your components as **native ES modules** —
no bundling step in the dev loop. npm dependencies are handled via **import maps**:

```html
<script type="importmap">
{
  "imports": {
    "react": "/deps/react.js",
    "react/jsx-runtime": "/deps/react_jsx-runtime.js",
    "@stylexjs/stylex": "/node_modules/.../stylex.mjs"
  }
}
</script>
<script type="module" src="/app_main.js"></script>
```

**ESM packages** (e.g. `@stylexjs/stylex`, `react-router`) are served directly
from `node_modules` — zero processing. The `browser_dep` rule walks the package's
files at build time, discovers all internal chunks and bare imports, and generates
a manifest.

**CJS packages** (e.g. `react`, `react-dom`) are pre-bundled to ESM by esbuild at
build time. Named exports are discovered by loading the CJS module with `require()`
and generating a destructuring stub:

```js
import * as __mod from "react/jsx-runtime";
const { jsx, jsxs, Fragment } = __mod;
export { jsx, jsxs, Fragment };
```

The dev server also handles **SPA fallback** — any request without a file extension
that doesn't match a static file returns `index.html`, so client-side routing works
on refresh.

### Browser Dependencies

`browser_dep` targets are defined once in `//devtools/build/js` and shared across
all apps:

```python
# //devtools/build/js/BUILD
browser_dep(
    name = "react",
    package = "react",
    deps = ["//:node_modules/react"],
)
```

Each `browser_dep` outputs:
- `<name>.json` — manifest (type: "esm" or "bundle", import map entries, file list)
- `<name>.js` — bundled ESM (CJS packages) or placeholder (ESM packages)
- `<name>_node_modules` — filegroup of node_modules for runfiles

#### Adding a new npm dependency

1. Add to `package.json` and run `pnpm install`
2. Add a `browser_dep` target in `//devtools/build/js/BUILD`
3. If the package has transitive npm deps needed at runtime (e.g. `react-router` needs `react`), include them in `deps`
4. Reference it from your `react_app`'s `browser_deps`

#### ESM Detection

The `browser_dep` script resolves packages using Node.js conventions:
1. Check `package.json` `exports["."].import` condition (handles nested `{types, default}`)
2. Check `package.json` `module` field (legacy)
3. Check `package.json` `type: "module"`
4. Fallback: CJS via `require.resolve()`

### Production Bundle

`esbuild` bundles everything into a single JS file for production. The HTML template
uses `expand_template` to inject the script and CSS tags:

```python
expand_template(
    name = "app_html",
    substitutions = {
        "{{HEAD}}": '<link rel="stylesheet" href="/app_styles.css" />',
        "{{SCRIPTS}}": '<script src="/app_bundle.js"></script>',
    },
    template = "//devtools/build/react_component:index.html.tpl",
)
```

## File Layout

```
devtools/build/js/               — shared JS infrastructure
├── browser_dep.bzl              — rule: prepare npm package for browser
├── browser_dep.mjs              — script: CJS→ESM + ESM manifest generation
├── devserver.bzl                — macro: dev server with import maps
├── devserver.mjs                — script: static file server + SPA fallback
├── BUILD                        — shared browser_dep targets
└── README.md

devtools/build/react_component/  — React + StyleX specifics
├── react_app.bzl                — macro: route() + react_app()
├── react_app_codegen.mjs        — script: generates router.tsx + main.tsx
├── react_component.bzl          — macro: wraps ts_project with Babel transpiler
├── stylex_css.bzl               — macro: collect StyleX CSS
├── stylex_transpile.mjs         — script: Babel single-pass transpilation
├── stylex_collect_css.mjs       — script: merge .stylex.json → .css
├── babel.config.json            — shared Babel config
├── index.html.tpl               — default HTML template
└── BUILD

tsconfig.json                    — shared TypeScript config (ts_config rule)
```

## Design Decisions

### Why Babel instead of esbuild for transpilation?

StyleX requires a Babel plugin — it transforms `stylex.create()` calls at the AST
level to generate atomic CSS. esbuild's plugin API can't do this. If StyleX ships
an esbuild plugin, Babel can be dropped entirely.

### Why not bundle ESM deps?

ESM packages like `@stylexjs/stylex` and `react-router` are served directly from
`node_modules` via import maps. No esbuild step. This means:
- Faster builds (fewer esbuild actions in the `ibazel` loop)
- Better debugging (1:1 mapping between source and served files)
- Less framework code to maintain

CJS packages (`react`, `react-dom`) must still be bundled because browsers can't
load `require()` calls.

### Why define routes in Starlark?

Routes as Starlark data means the build system knows the app's structure:
- Component imports are generated, not hand-written
- The dependency graph is explicit — Bazel knows which pages depend on what
- CSS collection is automatic — `react_app` collects StyleX metadata from all route components
- Future: code splitting per route is a Bazel action, not a bundler heuristic

### Why import maps instead of bundling for dev?

The dev server serves your component `.js` files as native ES modules. No bundler
in the loop. Edit a `.tsx` file → `bazel build` (or `ibazel`) → refresh browser.
The import map tells the browser where to find bare specifiers like `"react"`.

This is the same approach as Vite ("dependency pre-bundling"), but implemented as
Bazel rules so it's cached and hermetic.
