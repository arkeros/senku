/**
 * Generates router.tsx and main.tsx from a route manifest JSON.
 *
 * The manifest is produced by the react_app_manifest rule with actual
 * file paths from ReactComponentInfo providers. Routes use lazy loading
 * via dynamic import() for per-route code splitting.
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

// Generate lazy route objects recursively
function generateRoute(route, indent) {
  const pad = " ".repeat(indent);

  if (route.path === "/") {
    // Index route
    if (route.import) {
      return `${pad}{ index: true, lazy: () => import("${route.import}").then(m => ({ Component: m.${route.name} })) }`;
    }
    return `${pad}{ index: true }`;
  }

  const parts = [`${pad}{ path: "${route.path}"`];

  if (route.import) {
    parts[0] += `, lazy: () => import("${route.import}").then(m => ({ Component: m.${route.name} }))`;
  }

  if (route.children && route.children.length > 0) {
    parts[0] += `, children: [`;
    for (let i = 0; i < route.children.length; i++) {
      parts.push(generateRoute(route.children[i], indent + 2));
      if (i < route.children.length - 1) {
        parts[parts.length - 1] += ",";
      }
    }
    parts.push(`${pad}]`);
  }

  parts[parts.length - 1] += " }";
  return parts.join("\n");
}

const routeEntries = manifest.routes.map((r) => generateRoute(r, 6));
const layout = manifest.layout;

// router.tsx — lazy imports only, no static imports needed
const routerCode = `import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/",
    lazy: () => import("${layout.import}").then(m => ({ Component: m.${layout.name} })),
    children: [
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
