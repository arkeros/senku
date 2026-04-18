# //devtools/build/js

Shared JavaScript infrastructure for serving npm packages in the browser via Bazel.

## browser_dep

Prepares a single npm package for browser consumption:

- **CJS packages** (e.g. `cookie`): bundled to a single ESM file with esbuild
- **ESM packages** (e.g. `@stylexjs/stylex`): served directly from `node_modules` — no bundling

```python
browser_dep(
    name = "my_library",
    package = "my-library/subpath",
    deps = ["//:node_modules/my-library"],
)
```

Optional parameters:
- `bundle = True` — force esbuild bundling even for ESM packages (for packages that mix client and server code)
- `external = ["react"]` — keep specific packages as bare imports when bundling (resolved via import map)

## browser_dep_group

Bundles multiple **CJS** packages together with esbuild's `splitting` mode. This is
required when packages share internal state — like React, where `react`,
`react/jsx-runtime`, and `react-dom/client` must use the same React instance.

Separate `browser_dep` targets would each inline their own copy of React. When
they interact (e.g. react-router calls `useContext` from the import-map React,
but react-dom has a different internal copy), hooks fail with "Invalid hook call."

`browser_dep_group` solves this by bundling them in one esbuild pass:

```python
browser_dep_group(
    name = "react",
    packages = [
        "react",
        "react/jsx-runtime",
        "react-dom/client",
    ],
    deps = [
        "//:node_modules/react",
        "//:node_modules/react-dom",
    ],
)
```

This produces:
- `react/react.js` — entry for `react`
- `react/react_jsx-runtime.js` — entry for `react/jsx-runtime`
- `react/react-dom_client.js` — entry for `react-dom/client`
- `react/chunk-XXXX.js` — shared React internals (one copy)
- `react.json` — manifest with import map entries for all three

### When to use which

| Situation | Use |
|---|---|
| Single CJS package, no shared state | `browser_dep` |
| Single ESM package | `browser_dep` (served directly) |
| Multiple CJS packages sharing internals (React) | `browser_dep_group` |
| ESM package with server-side transitive deps | `browser_dep` for the main package + `browser_dep` for each transitive dep (`cookie`, etc.) |

## Adding a new dependency

1. Add the npm package to `//:package.json` and run `pnpm install`
2. Add a `browser_dep` or `browser_dep_group` target in this BUILD file
3. If the package is ESM and imports other bare specifiers at runtime (e.g. `react-router` imports `react` and `cookie`), add those as `browser_dep` targets too and include them in `deps` so the manifest can discover them
4. Reference from your `react_app`'s `browser_deps`

## devserver

Dev server macro that serves components as unbundled ES modules with
[import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap).
Pair with `ibazel` for watch mode:

```
ibazel run //my/app:app_devserver
```

The import map is generated from `browser_dep` / `browser_dep_group` manifests and
injected into the HTML template at serve time. SPA fallback is built in for
client-side routing.
