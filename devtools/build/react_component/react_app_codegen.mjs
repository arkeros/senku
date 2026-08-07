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
let manifestFile, outRouter, outMain, outPrerender;
let i18nManifestImport, i18nRuntimeImport, i18nSourceLocale;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--out-router") outRouter = args[++i];
  else if (args[i] === "--out-main") outMain = args[++i];
  else if (args[i] === "--out-prerender") outPrerender = args[++i];
  else if (args[i] === "--i18n-manifest-import") i18nManifestImport = args[++i];
  else if (args[i] === "--i18n-runtime-import") i18nRuntimeImport = args[++i];
  else if (args[i] === "--i18n-source-locale") i18nSourceLocale = args[++i];
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

// Generate lazy route objects recursively
function generateRoute(route, indent) {
  const pad = " ".repeat(indent);
  const props = [];

  if (route.path === "/") {
    props.push("index: true");
  } else {
    props.push(`path: "${route.path}"`);
  }

  if (route.import) {
    props.push(`lazy: () => import("${route.import}").then(m => ({ Component: m.${route.name} }))`);
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

// router.tsx — lazy imports for route components, static imports for error boundaries
const routerCode = `import { createBrowserRouter } from "react-router";
${errorImportsBlock}
export const router = createBrowserRouter([
  {
    path: "/",
    lazy: () => import("${layout.import}").then(m => ({ Component: m.${layout.name} })),
${layoutErrorLine}    children: [
${routeEntries.join(",\n")},
    ],
  },
]);
`;

// main.tsx
const mainCode = i18nEnabled
  ? `import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "${routerModuleName}";
import { I18N_CATALOGS, type Locale } from "${i18nManifestImport}";
import { I18nProvider, pickLocale } from "${i18nRuntimeImport}";

const SUPPORTED_LOCALES = Object.keys(I18N_CATALOGS) as Locale[];
const locale = pickLocale(SUPPORTED_LOCALES, "${i18nSourceLocale}");

createRoot(document.getElementById("root")!).render(
  <I18nProvider locale={locale} catalog={I18N_CATALOGS[locale]}>
    <RouterProvider router={router} />
  </I18nProvider>,
);
`
  : `import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "${routerModuleName}";

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
`;

// prerender.tsx — the same route tree rendered to a string at build time.
//
// Three deliberate differences from router.tsx, each of which exists
// because this render happens once, in Node, with no client attached:
//
//   - Components are imported statically. `lazy()` is how the browser
//     avoids fetching a route it may never visit; here every route is
//     wanted immediately and there is no second request to save.
//   - Local names are positional (`Route0`), not the exported identifier.
//     Two packages may export the same name, and the client router only
//     avoids that collision because it never names them at all.
//   - No `errorElement`. A component that throws here should fail the
//     build loudly, not quietly ship a document whose entire body is an
//     error page rendered as if it were the app.
const prerenderLocals = [];
const prerenderImports = [];

function localFor(node) {
  const local = `Route${prerenderLocals.length}`;
  prerenderLocals.push(local);
  prerenderImports.push(`import { ${node.name} as ${local} } from "${node.import}";`);
  return local;
}

function prerenderRoute(route, indent) {
  const pad = " ".repeat(indent);
  const props = [route.path === "/" ? "index: true" : `path: ${JSON.stringify(route.path)}`];

  if (route.import) props.push(`Component: ${localFor(route)}`);

  if (route.children && route.children.length > 0) {
    const kids = route.children.map((c) => prerenderRoute(c, indent + 2));
    return [`${pad}{ ${props.join(", ")}, children: [`, kids.join(",\n"), `${pad}] }`].join("\n");
  }
  return `${pad}{ ${props.join(", ")} }`;
}

// The layout's local has to be allocated before its children so the import
// order matches the tree, and `prerenderRoute` appends as it walks.
const prerenderLayoutLocal = localFor(layout);
const prerenderChildren = manifest.routes.map((r) => prerenderRoute(r, 6)).join(",\n");

const prerenderTree = `const routes = [
  {
    path: "/",
    Component: ${prerenderLayoutLocal},
    children: [
${prerenderChildren},
    ],
  },
];`;

const prerenderApp = i18nEnabled
  ? `    <I18nProvider locale={LOCALE} catalog={I18N_CATALOGS[LOCALE]}>
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </I18nProvider>`
  : `    <StaticRouterProvider router={router} context={context} hydrate={false} />`;

// The source locale, not a negotiated one: one document is served to every
// visitor, so there is no request whose `Accept-Language` could pick. The
// client re-renders in its own locale — see the ADR on why this markup is
// never hydrated.
const prerenderI18nImports = i18nEnabled
  ? `import { I18N_CATALOGS, type Locale } from "${i18nManifestImport}";
import { I18nProvider } from "${i18nRuntimeImport}";

const LOCALE = "${i18nSourceLocale}" as Locale;
`
  : "";

const prerenderCode = `import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";

${prerenderImports.join("\n")}
${prerenderI18nImports}
${prerenderTree}

export async function render(pathname: string): Promise<string> {
  const handler = createStaticHandler(routes);
  // The origin is arbitrary and never leaves this process — \`query\` needs a
  // whole URL, and only the path is matched against the route tree.
  const context = await handler.query(new Request("http://prerender" + pathname));

  // A Response here means a route redirected or threw rather than matching,
  // which would otherwise be written out as an empty body and shipped as a
  // document that renders nothing.
  if (context instanceof Response) {
    throw new Error(
      \`prerender: \${pathname} produced a \${context.status} response instead of markup\`,
    );
  }

  const router = createStaticRouter(routes, context);
  return renderToStaticMarkup(
${prerenderApp},
  );
}
`;

// The Node half, kept out of the .tsx above so that file stays a pure
// render module: no `node:fs`, no `process`, and therefore no need for
// `@types/node` in the tsconfig every react_component shares. Plain .mjs,
// so tsc never type-checks it and esbuild is the only thing that reads it.
const prerenderMainCode = `import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "./${outPrerender ? outPrerender.split("/").pop().replace(/\.tsx$/, "") : ""}.js";

const argv = process.argv.slice(2);
let path = "/";
let out = "";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--path") path = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else throw new Error("prerender: unknown arg: " + argv[i]);
}
if (!out) throw new Error("prerender: --out is required");

// Same execroot dance as the other codegen tools: js_binary cds into
// bazel-bin, and the path Bazel passes is relative to the execroot.
const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

// \`.then\` rather than top-level await: this is bundled for Node, where
// esbuild emits CJS, and CJS has no top-level await. The \`catch\` is what
// turns a component that throws mid-render into a failed build instead of
// an unhandled rejection and a document with an empty body.
render(path)
  .then((markup) => writeFileSync(resolve(execroot, out), markup))
  .catch((err) => {
    console.error(\`prerender: rendering \${path} failed\`);
    console.error(err);
    process.exit(1);
  });
`;

const outPrerenderMain = outPrerender
  ? outPrerender.replace(/\.tsx$/, "_main.mjs")
  : null;

for (const f of [outRouter, outMain, outPrerender, outPrerenderMain].filter(Boolean)) {
  mkdirSync(dirname(resolve(execroot, f)), { recursive: true });
}

writeFileSync(resolve(execroot, outRouter), routerCode);
writeFileSync(resolve(execroot, outMain), mainCode);
if (outPrerender) {
  writeFileSync(resolve(execroot, outPrerender), prerenderCode);
  writeFileSync(resolve(execroot, outPrerenderMain), prerenderMainCode);
}
