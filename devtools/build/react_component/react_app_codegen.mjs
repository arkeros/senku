/**
 * Generates router.tsx and main.tsx from a route manifest JSON.
 *
 * The manifest is produced by the react_app_manifest rule with actual
 * file paths resolved from each component target's DefaultInfo. Routes
 * use lazy loading via dynamic import() for per-route code splitting.
 *
 * Usage: node react_app_codegen.mjs --manifest <file.json> --out-router <router.tsx> --out-main <main.tsx>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let manifestFile, outRouter, outMain;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--out-router") outRouter = args[++i];
  else if (args[i] === "--out-main") outMain = args[++i];
}

if (!manifestFile || !outRouter || !outMain) {
  console.error("Usage: react_app_codegen.mjs --manifest <file> --out-router <file> --out-main <file>");
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const manifest = JSON.parse(readFileSync(resolve(execroot, manifestFile), "utf-8"));
const routerModuleName = "./" + outRouter.split("/").pop().replace(/\.tsx$/, "");

// Collect error components as top-of-file static imports. Error boundaries
// must be synchronously available — if a lazy Component fails to load, a
// lazy errorElement could fail the same way and mask the real error.
//
// Two different packages may export the same error-component name (manifest
// uses the component's exported identifier, which is not globally unique).
// Key by (importPath, name) and alias same-named imports to a locally unique
// identifier so they can coexist in the generated router module.
const errorImports = new Map(); // `${path}\0${name}` -> { name, path, localName }

function makeErrorImportKey(importPath, name) {
  return `${importPath}\0${name}`;
}

function toIdentifierSuffix(value) {
  return value.replace(/[^A-Za-z0-9_$]+/g, "_").replace(/^([^A-Za-z_$])/, "_$1");
}

function getErrorImportLocalName(importPath, name) {
  const key = makeErrorImportKey(importPath, name);
  const existing = errorImports.get(key);
  if (existing) return existing.localName;

  let localName = name;
  if (Array.from(errorImports.values()).some((entry) => entry.localName === localName)) {
    localName = `${name}__${toIdentifierSuffix(importPath)}`;
  }

  errorImports.set(key, { name, path: importPath, localName });
  return localName;
}

function collectErrorImports(routes) {
  for (const r of routes) {
    if (r.error_name && r.error_import) {
      r.error_name = getErrorImportLocalName(r.error_import, r.error_name);
    }
    if (r.children) collectErrorImports(r.children);
  }
}

if (manifest.layout.error_name && manifest.layout.error_import) {
  manifest.layout.error_name = getErrorImportLocalName(
    manifest.layout.error_import,
    manifest.layout.error_name,
  );
}
collectErrorImports(manifest.routes);

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

  if (route.error_name) {
    props.push(`errorElement: <${route.error_name} />`);
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

const layoutErrorLine = layout.error_name
  ? `    errorElement: <${layout.error_name} />,\n`
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
const mainCode = `import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "${routerModuleName}";

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
`;

for (const f of [outRouter, outMain]) {
  mkdirSync(dirname(resolve(execroot, f)), { recursive: true });
}

writeFileSync(resolve(execroot, outRouter), routerCode);
writeFileSync(resolve(execroot, outMain), mainCode);
