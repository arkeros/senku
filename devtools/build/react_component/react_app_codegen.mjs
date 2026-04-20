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

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--out-router") outRouter = args[++i];
  else if (args[i] === "--out-main") outMain = args[++i];
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

for (const f of [outRouter, outMain]) {
  mkdirSync(dirname(resolve(execroot, f)), { recursive: true });
}

writeFileSync(resolve(execroot, outRouter), routerCode);
writeFileSync(resolve(execroot, outMain), mainCode);
