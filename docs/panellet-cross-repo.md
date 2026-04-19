# Consuming Panellet from Another Workspace

Panellet is designed to be used as a `bazel_dep` from a downstream bzlmod
module — your workspace doesn't have to be inside `@senku`. This doc covers
the setup, the design rules that keep cross-repo use tractable, and the
small handful of patterns to know.

## Setup

### 1. Add `@senku` as a bzlmod dep

In your `MODULE.bazel`:

```python
bazel_dep(name = "senku", version = "0.0.0")

# During iteration:
local_path_override(module_name = "senku", path = "../senku")

# Or pinned to a published commit:
git_override(
    module_name = "senku",
    commit = "<sha>",
    remote = "https://github.com/arkeros/senku.git",
)
```

Senku itself depends on `aspect_rules_js`, `aspect_rules_ts`,
`aspect_rules_esbuild`, `rules_python_gazelle_plugin`,
`bazel_skylib_gazelle_plugin`, etc. Bzlmod resolves these transitively.

### 2. Add the npm packages your panellet app uses

Panellet's macros emit bare `//:node_modules/<pkg>` references that
resolve in your repo's BUILD context — so each consumer pins its own
versions of the framework's npm deps. Add these to your `package.json`:

```jsonc
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0",
    "@stylexjs/stylex": "^0.18.0",
    "messageformat": "^4.0.0",          // only if using i18n
    "cookie": "^1.0.0",
    "set-cookie-parser": "^2.7.0",
    "mime": "^4.0.0",
    "open-props": "^1.7.0"              // only if jit_open_props=True
  },
  "devDependencies": {
    "@babel/core": "^7.29.0",
    "@babel/preset-react": "^7.28.0",
    "@babel/preset-typescript": "^7.28.0",
    "@stylexjs/babel-plugin": "^0.18.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "postcss": "^8.5.0",
    "postcss-jit-props": "^1.0.0"       // only if jit_open_props=True
  }
}
```

Then `pnpm install` to lock.

### 3. Wire panellet's first-party packages into your root BUILD

In your repo root `BUILD`:

```python
load("@aspect_rules_js//npm:defs.bzl", "npm_link_package")
load("@npm//:defs.bzl", "npm_link_all_packages")
load("@senku//devtools/build/panellet:install.bzl", "panellet_browser_modules")

npm_link_all_packages(name = "node_modules")

# Link panellet's i18n runtime as a first-party npm package. Only needed
# when you use locales=... on react_app.
npm_link_package(
    name = "node_modules/@panellet/i18n-runtime",
    src = "@senku//devtools/build/react_component/i18n_runtime:pkg",
    visibility = ["//visibility:public"],
)

# Materialize the canonical browser_modules for panellet apps as
# //:browser_modules/<npm-specifier> targets — esm.sh-style local serving
# pinned to *your* pnpm-lock versions.
panellet_browser_modules(i18n = True)  # i18n=False if you skip locales
```

### 4. Write your app

```python
# my/app/BUILD
load("@senku//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("@senku//devtools/build/react_component:react_component.bzl", "react_component")
load("@senku//devtools/build/react_component:stylex_library.bzl", "stylex_library")

stylex_library(
    name = "tokens",
    srcs = ["tokens.stylex.ts"],
)

react_component(
    name = "Layout",
    srcs = ["Layout.tsx"],
    deps = [
        ":tokens",
        "//:node_modules/react-router",
    ],
)

react_component(
    name = "Home",
    srcs = ["Home.tsx"],
    i18n = ["Home.en.mf2.json", "Home.es.mf2.json"],  # optional
    deps = [
        ":tokens",
        "//:node_modules/@panellet/i18n-runtime",      # if using Trans/useI18n
    ],
)

react_app(
    name = "app",
    layout = ":Layout",
    routes = [route(path = "/", component = ":Home")],
    browser_deps = [
        "//:browser_modules/_react",
        "//:browser_modules/react-router",
        "//:browser_modules/cookie",
        "//:browser_modules/set-cookie-parser",
        "//:browser_modules/@stylexjs/stylex",
        "//:browser_modules/messageformat",            # if using i18n
        "//:browser_modules/@panellet/i18n-runtime",   # if using i18n
    ],
    locales = ["en", "es"],          # optional
    source_locale = "en",            # required when locales is set
    html_template = "index.html.tpl",
)
```

In `Home.tsx`:

```tsx
import { Trans, useI18n } from "@panellet/i18n-runtime";

export function Home() {
  const { format } = useI18n();
  return <h1><Trans id="home.title" /></h1>;
}
```

## Design rules

When you read or extend panellet's macros, three patterns govern how
labels and references behave cross-repo:

### Rule 1 — Wrap framework-owned references in `Label()`

Bare-string labels in Starlark macros resolve at the **caller's** BUILD
package. That's correct for things the caller pins (their react version),
wrong for things `@senku` owns (its tools, templates, default tsconfig).

For framework-owned refs, wrap in `Label()`:

```python
# Tool we provide and own:
js_run_binary(
    tool = Label("//devtools/build/react_component:react_app_codegen_bin"),
    ...
)

# Default tsconfig we ship:
_DEFAULT_TSCONFIG = Label("//:tsconfig")
```

`Label("...")` evaluates at `.bzl` load time in the file's defining
module, so it always resolves to `@senku`. Bare strings keep evaluating
at the caller's BUILD, so the consumer's pnpm versions of react/stylex
flow through naturally:

```python
deps = [
    "//:node_modules/react",        # ← consumer's react
    "//:node_modules/@stylexjs/stylex",  # ← consumer's stylex
],
```

### Rule 2 — Distribute first-party runtimes as npm packages

Anything panellet exposes for consumer code to *import* (currently:
`@panellet/i18n-runtime`) ships as a real npm package via `npm_package`,
not as a `react_component` consumed via relative path. Standard module
resolution then handles it everywhere — TypeScript, esbuild, the
devserver, the IDE language service.

If panellet later adds shared runtimes (form helpers, route hooks, etc.),
the same pattern applies: `package.json` + `npm_package` in the runtime's
BUILD, `npm_link_package` from the consumer's root.

### Rule 3 — Instantiate processing tools in the consumer's tree

Tools that operate on *consumer-owned* data (`browser_dep` wrapping the
consumer's npm packages, for example) should be **invoked** in the
consumer's BUILD, even though the macros live in `@senku`. That's what
`panellet_browser_modules()` does — calls `browser_dep` from the
caller's package, where `cwd`, runfiles, and node_modules all
self-consistently point at the consumer's tree.

Don't pre-instantiate consumer-data-processing tools inside `@senku`
and ask consumers to label-reference them. That couples senku's pnpm
versions to the consumer's app and forces cwd/runfiles bridging tricks
that are fragile and surface in unexpected places.

## Notes and gotchas

### Babel plugin loading is the residual cross-repo cost

`stylex_transpile.mjs` invokes Babel with bare plugin/preset strings
(`"@babel/preset-typescript"`, `"@stylexjs/babel-plugin"`). Babel's
internal loader walks node_modules from babel-core's location, which
under pnpm's virtual store doesn't reach @senku's top-level packages
when run cross-repo (e.g., when astrograde builds `@panellet/i18n-runtime`
through `npm_link_package`).

Fix: pre-resolve via `createRequire(import.meta.url).resolve(...)` and
hand babel absolute paths. This sidesteps Babel's resolver entirely.

If you add a panellet tool that loads plugins by name from a third-party
library, apply the same pattern.

### TypeScript config inheritance

`react_component`'s default `tsconfig` is `Label("//:tsconfig")`, which
resolves to `@senku//:tsconfig` — a panellet-tuned config (jsx,
moduleResolution: "bundler", target: "es2022"). You don't need a
matching `//:tsconfig` in your own repo for panellet to type-check
correctly.

If you need different settings for a particular component, pass the
`tsconfig` arg explicitly:

```python
react_component(
    name = "MyComponent",
    srcs = ["MyComponent.tsx"],
    tsconfig = "//path/to/your:tsconfig",
)
```

### Naming convention for browser modules

Targets created by `panellet_browser_modules()` mirror npm specifiers
exactly:

| npm specifier              | Bazel label                                    |
|----------------------------|------------------------------------------------|
| `react` (CJS group)        | `//:browser_modules/_react`                    |
| `react-router`             | `//:browser_modules/react-router`              |
| `set-cookie-parser`        | `//:browser_modules/set-cookie-parser`         |
| `@stylexjs/stylex`         | `//:browser_modules/@stylexjs/stylex`          |
| `@panellet/i18n-runtime`   | `//:browser_modules/@panellet/i18n-runtime`    |

The `_react` group is the only deviation — it's a multi-package CJS
bundle (`react` + `react-dom/client` + `react/jsx-runtime`) that has to
ship together so they share React internals.

### Customizing the umbrella names

`panellet_browser_modules` mirrors `npm_link_all_packages`'s parameter
shape — both umbrella names are overridable:

```python
npm_link_all_packages(name = "vendor")            # //:vendor/<pkg>
panellet_browser_modules(
    name = "browser_vendor",                      # //:browser_vendor/<pkg>
    node_modules = "vendor",                      # match npm_link_all_packages
)
```

The defaults (`name = "browser_modules"`, `node_modules = "node_modules"`)
match what most repos use, so the common case is just
`panellet_browser_modules(i18n = True)`. The check that fails on missing
packages uses the `node_modules` argument too — its error message points
at the right umbrella name regardless of customization.

### Adding extra browser modules

If you want a browser_dep for a package not in the canonical set, call
`browser_dep` directly:

```python
load("@senku//devtools/build/js:browser_dep.bzl", "browser_dep")

browser_dep(
    name = "browser_modules/jotai",
    package = "jotai",
    deps = ["//:node_modules/jotai"],
    visibility = ["//visibility:public"],
)
```

Then reference `//:browser_modules/jotai` in your `react_app`'s
`browser_deps`.
