/**
 * Generates router.tsx and main.tsx from a route manifest JSON.
 *
 * The manifest is produced by the react_app_manifest rule with actual
 * file paths resolved from each component target's DefaultInfo. Routes
 * use lazy loading via dynamic import() for per-route code splitting.
 *
 * When --i18n-* flags are set, main.tsx additionally wraps the router in
 * <I18nProvider> using the generated catalog manifest. Keeping the wrap
 * here (instead of in the user's Layout) avoids a circular dep: the
 * manifest is built from each component's fragments, so any component
 * that imports the manifest becomes its own ancestor.
 *
 * Usage: node react_app_codegen.mjs --manifest <file.json> --out-router <router.tsx> --out-main <main.tsx>
 *        [--i18n-manifest-import <relpath>] [--i18n-runtime-import <relpath>]
 *        [--i18n-source-locale <locale>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as R from "ramda";

const args = process.argv.slice(2);
let manifestFile, outRouter, outMain;
let i18nManifestImport, i18nRuntimeImport, i18nSourceLocale;
let ssrClient = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--out-router") outRouter = args[++i];
  else if (args[i] === "--out-main") outMain = args[++i];
  else if (args[i] === "--i18n-manifest-import") i18nManifestImport = args[++i];
  else if (args[i] === "--i18n-runtime-import") i18nRuntimeImport = args[++i];
  else if (args[i] === "--i18n-source-locale") i18nSourceLocale = args[++i];
  else if (args[i] === "--ssr-client") ssrClient = true;
}

if (!manifestFile || !outRouter || !outMain) {
  console.error("Usage: react_app_codegen.mjs --manifest <file> --out-router <file> --out-main <file>");
  process.exit(1);
}

const i18nEnabled = Boolean(
  i18nManifestImport && i18nRuntimeImport && i18nSourceLocale,
);
if ((i18nManifestImport || i18nRuntimeImport || i18nSourceLocale) && !i18nEnabled) {
  console.error(
    "react_app_codegen: --i18n-manifest-import, --i18n-runtime-import, and --i18n-source-locale must all be set together",
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const manifest = JSON.parse(readFileSync(resolve(execroot, manifestFile), "utf-8"));
const routerModuleName = "./" + outRouter.split("/").pop().replace(/\.tsx$/, "");

// Error boundaries must be statically imported — a lazy boundary risks the
// same failure that triggered it, masking the real error. We resolve each
// (importPath, name) to a locally unique identifier in a single pass, then
// look it up during route generation; the manifest is never mutated.
//
// Two packages may export error components with the same name (manifest uses
// the exported identifier, which isn't globally unique). First seen wins the
// original identifier; later (path, name) entries are aliased with a
// path-derived suffix.

const toIdentifierSuffix = R.pipe(
  R.replace(/[^A-Za-z0-9_$]+/g, "_"),
  R.replace(/^([^A-Za-z_$])/, "_$1"),
);

const hasErrorRef = (r) => Boolean(r.error_name && r.error_import);
const errorKey = (r) => `${r.error_import}\0${r.error_name}`;

// Depth-first flatten of the nested route tree.
const flattenRoutes = R.chain((r) =>
  r.children ? [r, ...flattenRoutes(r.children)] : [r],
);

// All error-component references in traversal order (layout first).
const collectErrorRefs = (m) =>
  R.filter(hasErrorRef, [m.layout, ...flattenRoutes(m.routes)]);

// Resolve (path, name) -> { path, name, localName }, aliasing collisions.
const buildErrorImportTable = R.pipe(
  R.uniqBy(errorKey),
  (refs) =>
    R.mapAccum(
      (seen, ref) => {
        const { error_import: path, error_name: name } = ref;
        const localName = seen.has(name)
          ? `${name}__${toIdentifierSuffix(path)}`
          : name;
        return [new Set(seen).add(name), [errorKey(ref), { path, name, localName }]];
      },
      new Set(),
      refs,
    )[1],
  (entries) => new Map(entries),
);

const errorImports = buildErrorImportTable(collectErrorRefs(manifest));

const resolveErrorLocalName = (path, name) =>
  errorImports.get(`${path}\0${name}`).localName;

const errorImportLines = Array.from(errorImports.values())
  .map(({ name, path, localName }) =>
    localName === name
      ? `import { ${name} } from "${path}";`
      : `import { ${name} as ${localName} } from "${path}";`,
  )
  .join("\n");

// Map an import path the manifest emitted (`./pages/Foo`) to the
// extension-stripped module specifier the codegen should reference.
// In SSR-client mode we point at the dual-compile's `.client.js`
// so server-only `preload`/`meta` exports never reach the browser.
const lazyImportPath = (path) => (ssrClient ? `${path}.client` : path);

// .client.js ships without a sibling .client.d.ts. The ambient
// declarations live in dual_compile_modules.d.ts (staged into the
// generated package by react_ssr_app); ts_project picks it up
// alongside the router source so `import("./X.client")` types as
// `Promise<any>` instead of TS2307.

// SSR-client mode and SPA mode both use `lazy:` — react-router's own
// lazy mechanism — so esbuild emits one chunk per dynamic `import()`.
// The hydration-mismatch problem `route.lazy` had on its own (chunk
// loads async, RouterProvider renders fallback during the gap) is
// solved upstream: the SSR server emits `<link rel="modulepreload">`
// for the matched-chain chunks plus a `window.__panellet_preloads__`
// list, and `client_main.tsx` top-level-awaits them before
// `hydrateRoot`. By the time `route.lazy()` fires the chunks are in
// the module cache and the promise resolves on the next microtask,
// which is fast enough for hydration to match.

// Generate route objects recursively
function generateRoute(route, indent) {
  const pad = " ".repeat(indent);
  const props = [];

  if (route.path === "/") {
    props.push("index: true");
  } else {
    props.push(`path: "${route.path}"`);
  }

  if (route.import) {
    props.push(
      `lazy: () => import("${lazyImportPath(route.import)}").then(m => ({ Component: m.${route.name} }))`,
    );
  }

  if (hasErrorRef(route)) {
    const localName = resolveErrorLocalName(route.error_import, route.error_name);
    props.push(`errorElement: <${localName} />`);
  }

  if (route.children && route.children.length > 0) {
    const lines = [`${pad}{ ${props.join(", ")}, children: [`];
    for (let i = 0; i < route.children.length; i++) {
      const childLine = generateRoute(route.children[i], indent + 2);
      lines.push(i < route.children.length - 1 ? childLine + "," : childLine);
    }
    lines.push(`${pad}] }`);
    return lines.join("\n");
  }

  return `${pad}{ ${props.join(", ")} }`;
}

const routeEntries = manifest.routes.map((r) => generateRoute(r, 6));
const layout = manifest.layout;

const layoutErrorLine = hasErrorRef(layout)
  ? `    errorElement: <${resolveErrorLocalName(layout.error_import, layout.error_name)} />,\n`
  : "";

const errorImportsBlock = errorImportLines ? errorImportLines + "\n" : "";

// Empty routes would otherwise emit `children: [\n,\n]` — a sparse
// `undefined` slot tsc rejects as `undefined` in `RouteObject[]`.
const childrenBlock = routeEntries.length > 0
  ? `    children: [\n${routeEntries.join(",\n")},\n    ],`
  : "    children: [],";

// In SSR-client mode, `window.__staticRouterHydrationData` carries the
// server's already-resolved loaderData / actionData / errors. Passing
// it to `createBrowserRouter` skips the "loading" state on first
// render — without it, react-router treats the page as a fresh client
// nav and the resulting tree mismatches the server-rendered HTML.
const hydrationDataBlock = ssrClient
  ? `, {
  hydrationData: (window as unknown as {
    __staticRouterHydrationData?: HydrationState;
  }).__staticRouterHydrationData,
}`
  : "";
const hydrationDataImport = ssrClient
  ? "import type { HydrationState } from \"react-router\";\n"
  : "";

// router.tsx — error boundaries are statically imported regardless of
// mode (a lazy boundary risks the same failure that triggered it).
const routerCode = `import { createBrowserRouter } from "react-router";
${hydrationDataImport}${errorImportsBlock}
export const router = createBrowserRouter([
  {
    path: "/",
    lazy: () => import("${lazyImportPath(layout.import)}").then(m => ({ Component: m.${layout.name} })),
${layoutErrorLine}${childrenBlock}
  },
]${hydrationDataBlock});
`;

// main.tsx — SSR-client mode top-level-awaits
// `window.__panellet_preloads__` (chunks the server emitted
// modulepreload links for) so by the time `hydrateRoot` runs, every
// `route.lazy()` import resolves from the module cache on the next
// microtask. Without the await, react-router would render its
// internal fallback during the lazy gap and React 19 would diff the
// fallback against the server's resolved tree → hydration mismatch.
// <StrictMode> wraps the app so dev-only effect double-invocation
// surfaces accidental side effects in route components and hooks
// (no-op in production).
const reactDomEntry = ssrClient ? "hydrateRoot" : "createRoot";
const wrapMount = (children) =>
  ssrClient
    ? `hydrateRoot(document.getElementById("root")!, <StrictMode>${children}</StrictMode>);`
    : `createRoot(document.getElementById("root")!).render(<StrictMode>${children}</StrictMode>);`;

const ssrPreloadAwait = ssrClient
  ? `await Promise.all(
  ((window as unknown as { __panellet_preloads__?: string[] }).__panellet_preloads__ ?? [])
    .map((u) => import(/* @vite-ignore */ u)),
);

`
  : "";

const mainCode = i18nEnabled
  ? `import { StrictMode } from "react";
import { ${reactDomEntry} } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "${routerModuleName}";
import { I18N_CATALOGS, type Locale } from "${i18nManifestImport}";
import { I18nProvider, pickLocale } from "${i18nRuntimeImport}";

const SUPPORTED_LOCALES = Object.keys(I18N_CATALOGS) as Locale[];
const locale = pickLocale(SUPPORTED_LOCALES, "${i18nSourceLocale}");

${ssrPreloadAwait}${wrapMount(`<I18nProvider locale={locale} catalog={I18N_CATALOGS[locale]}>
    <RouterProvider router={router} />
  </I18nProvider>`)}
`
  : `import { StrictMode } from "react";
import { ${reactDomEntry} } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "${routerModuleName}";

${ssrPreloadAwait}${wrapMount("<RouterProvider router={router} />")}
`;

for (const f of [outRouter, outMain]) {
  mkdirSync(dirname(resolve(execroot, f)), { recursive: true });
}

writeFileSync(resolve(execroot, outRouter), routerCode);
writeFileSync(resolve(execroot, outMain), mainCode);
