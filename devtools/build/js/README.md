# //devtools/build/js

Shared JavaScript infrastructure for serving npm packages in the browser via Bazel.

## browser_dep

Prepares an npm package for browser consumption. Handles both CJS and ESM packages:

- **CJS packages** (e.g. React): bundled to a single ESM file with esbuild at build time
- **ESM packages** (e.g. StyleX): served directly from `node_modules` — no bundling

Targets are defined once here and shared across all apps in the monorepo.

### Adding a new dependency

1. Add the npm package to `//:package.json` and run `pnpm install`
2. Add a `browser_dep` target in this BUILD file:

```python
browser_dep(
    name = "my_library",
    package = "my-library/subpath",  # the import specifier your code uses
    deps = ["//:node_modules/my-library"],
)
```

3. Reference it from your devserver:

```python
load("//devtools/build/js:devserver.bzl", "devserver")

devserver(
    name = "devserver",
    browser_deps = [
        "//devtools/build/js:my_library",
        "//devtools/build/js:react_jsx_runtime",
        # ...
    ],
    # ...
)
```

## devserver

Dev server macro that serves components as unbundled ES modules with [import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap). Pair with `ibazel` for watch mode:

```
ibazel run //my/app:devserver
```

The import map is generated from `browser_dep` manifests and injected into the HTML template at serve time.
