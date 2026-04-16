/**
 * Generates router.tsx and main.tsx from a route manifest JSON.
 *
 * Supports nested routes and route parameters.
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

// Collect imports from all routes (recursively)
const imports = [];
const usedNames = new Set();
const componentNames = new Map();

function getComponentName(importPath) {
  if (componentNames.has(importPath)) return componentNames.get(importPath);
  const base = importPath.split("/").pop();
  let name = base;
  let i = 2;
  while (usedNames.has(name)) {
    name = base + i++;
  }
  usedNames.add(name);
  componentNames.set(importPath, name);
  return name;
}

// Register layout
const layoutName = getComponentName(manifest.layout.import);
imports.push(`import { ${layoutName} } from "${manifest.layout.import}";`);

// Recursively register all route components
function collectImports(routes) {
  for (const route of routes) {
    if (route.component) {
      const name = getComponentName(route.component.import);
      imports.push(`import { ${name} } from "${route.component.import}";`);
    }
    if (route.children) {
      collectImports(route.children);
    }
  }
}
collectImports(manifest.routes);

// Generate route objects recursively
function generateRoute(route, indent) {
  const pad = " ".repeat(indent);
  const parts = [];

  if (route.path === "/") {
    parts.push(`${pad}{ index: true`);
  } else {
    parts.push(`${pad}{ path: "${route.path}"`);
  }

  if (route.component) {
    const name = getComponentName(route.component.import);
    parts[0] += `, Component: ${name}`;
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

// router.tsx
const routerCode = `import { createBrowserRouter } from "react-router";
${imports.join("\n")}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: ${layoutName},
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
