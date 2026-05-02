/**
 * Generates `{name}_server.tsx` from a react_app_manifest JSON.
 *
 * The output is the prod (and dev) Hono server entry. It statically
 * imports every route component's regular `.js` (the dual-compile's
 * `.server.js` is byte-identical at this step — full module — so we
 * keep type-checking happy by importing the path that has a sibling
 * `.d.ts`).
 *
 * Wires:
 *   - `createStaticHandler(routes)`     — runs the matched-route chain.
 *   - `renderToReadableStream(...)`     — streams the React tree as a
 *     Web ReadableStream. We pick `react-dom/server.edge` (ESM-native,
 *     Web streams) over `server.node` (CJS, Node streams) because Hono
 *     wants a Web `Response` body and Node 22 has Web streams natively;
 *     `server.node`'s CJS-into-ESM bundling otherwise drags in a
 *     `createRequire` shim for `require("util")`.
 *   - Hono `serveStatic` for `/assets/*`, `/*.css`, and the client
 *     bundle's chunk directory (so the browser can fetch
 *     `<script type="module">` and lazy chunks emitted by react-router's
 *     `route.lazy`).
 *   - Document head emits a `<script type="module" src="…">` for the
 *     client bundle entry. Per-route modulepreload (deeper than the
 *     entry script) is on the roadmap follow-ups list.
 *
 * Out of scope at step 7 (later commits):
 *   - `preload` / `meta` plumbing (steps 8–9)
 *   - `runtime_config` data island (step 10)
 *   - Locale negotiation (step 11)
 *   - Error handling / `redirect()` re-export (step 12)
 *
 * Usage: node react_ssr_app_codegen.mjs --manifest <file.json>
 *        --out-server <{name}_server.tsx>
 *        [--app-title <string>]
 *        [--client-bundle-url <url>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as R from "ramda";

const args = process.argv.slice(2);
let manifestFile, outServer, appTitle, clientBundleUrl;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--out-server") outServer = args[++i];
  else if (args[i] === "--app-title") appTitle = args[++i];
  else if (args[i] === "--client-bundle-url") clientBundleUrl = args[++i];
}

if (!manifestFile || !outServer) {
  console.error(
    "Usage: react_ssr_app_codegen.mjs --manifest <file> --out-server <file> [--app-title <s>]",
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const manifest = JSON.parse(readFileSync(resolve(execroot, manifestFile), "utf-8"));

const title = appTitle ?? "panellet SSR";

// Each (importPath, name) pair becomes a unique local identifier; if two
// route components export the same name from different paths, the second
// gets a path-derived suffix so static imports don't collide.
const toIdentifierSuffix = R.pipe(
  R.replace(/[^A-Za-z0-9_$]+/g, "_"),
  R.replace(/^([^A-Za-z_$])/, "_$1"),
);

const importKey = (path, name) => `${path}\0${name}`;

const flattenRoutes = R.chain((r) =>
  r.children ? [r, ...flattenRoutes(r.children)] : [r],
);

const collectAllImports = (m) => {
  const seen = [];
  const all = [m.layout, ...flattenRoutes(m.routes)];
  for (const r of all) {
    if (r.import && r.name) {
      seen.push({ path: r.import, name: r.name });
    }
    if (r.error_import && r.error_name) {
      seen.push({ path: r.error_import, name: r.error_name });
    }
  }
  return seen;
};

const buildImportTable = R.pipe(
  R.uniqBy(({ path, name }) => importKey(path, name)),
  (refs) =>
    R.mapAccum(
      (seenNames, ref) => {
        const { path, name } = ref;
        const localName = seenNames.has(name)
          ? `${name}__${toIdentifierSuffix(path)}`
          : name;
        return [
          new Set(seenNames).add(name),
          [importKey(path, name), { ...ref, localName }],
        ];
      },
      new Set(),
      refs,
    )[1],
  (entries) => new Map(entries),
);

const importTable = buildImportTable(collectAllImports(manifest));

const resolveLocalName = (path, name) =>
  importTable.get(importKey(path, name)).localName;

const importLines = Array.from(importTable.values())
  .map(({ name, path, localName }) =>
    localName === name
      ? `import { ${name} } from "${path}";`
      : `import { ${name} as ${localName} } from "${path}";`,
  )
  .join("\n");

// Generate the route config recursively. No `lazy` here: roadmap step 7
// switches the client codegen to `route.lazy`, but the server bundle
// statically imports every route to avoid `await import()` round trips
// inside `createStaticHandler.query()`.
function generateRoute(route, indent) {
  const pad = " ".repeat(indent);
  const props = [];

  if (route.path === "/") {
    props.push("index: true");
  } else {
    props.push(`path: ${JSON.stringify(route.path)}`);
  }

  if (route.import && route.name) {
    props.push(`Component: ${resolveLocalName(route.import, route.name)}`);
  }

  if (route.error_import && route.error_name) {
    const local = resolveLocalName(route.error_import, route.error_name);
    props.push(`errorElement: <${local} />`);
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

const layoutLocal = resolveLocalName(layout.import, layout.name);
const layoutErrorLine = layout.error_import && layout.error_name
  ? `    errorElement: <${resolveLocalName(layout.error_import, layout.error_name)} />,\n`
  : "";

// Avoid emitting `children: [\n,\n]` (a sparse-array hole) when the app
// has no routes — happens in test fixtures and for an app whose layout
// is the only render target.
const childrenBlock = routeEntries.length > 0
  ? `    children: [\n${routeEntries.join(",\n")},\n    ],`
  : "    children: [],";

// Title is JSON-encoded into the source so quotes / backslashes can't
// break out of the string literal; HTML-escaping is React's job at
// render time, not the codegen's.
const titleLiteral = JSON.stringify(title);
const clientBundleUrlLiteral = JSON.stringify(clientBundleUrl ?? null);

const code = `/// <reference types="node" />
// Generated by react_ssr_app — do not edit.
import type { ReactNode } from "react";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { renderToReadableStream } from "react-dom/server.edge";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";

${importLines}

const CLIENT_BUNDLE_URL: string | null = ${clientBundleUrlLiteral};

// Document wraps the matched route tree in a full HTML document so
// renderToPipeableStream emits everything from <!DOCTYPE> on. Step 9
// will thread per-route <meta>/title in here from the matched chain.
function Document({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{${titleLiteral}}</title>
        {CLIENT_BUNDLE_URL ? (
          <script type="module" src={CLIENT_BUNDLE_URL} />
        ) : null}
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}

const routes: RouteObject[] = [
  {
    path: "/",
    Component: ${layoutLocal},
${layoutErrorLine}${childrenBlock}
  },
];

const handler = createStaticHandler(routes);

const staticRoot = process.env.PANELLET_STATIC_DIR ?? "./static";

const app = new Hono();

// Single \`serveStatic\` for every URL: hashed asset paths (\`/assets/...\`),
// CSS sheets (\`/{name}_styles.css\`), and the client bundle directory
// (\`/{name}_client_bundle/main.js\` + lazy chunks) all resolve under
// \`staticRoot\`. Non-existent files fall through to the SSR catch-all
// below, so route URLs like \`/about\` aren't shadowed.
app.use("*", serveStatic({ root: staticRoot }));

app.all("*", async (c) => {
  const context = await handler.query(c.req.raw);
  if (context instanceof Response) {
    return context;
  }

  const router = createStaticRouter(handler.dataRoutes, context);

  try {
    // The Promise resolves at shell-ready; the rest streams as Suspense
    // boundaries resolve. \`server.edge\`'s ReadableStream is Web-native,
    // so it drops directly into Hono's Response with no Node-stream
    // bridge.
    const stream = await renderToReadableStream(
      <Document>
        <StaticRouterProvider router={router} context={context} />
      </Document>,
      {
        onError(err: unknown) {
          // eslint-disable-next-line no-console
          console.error("panellet SSR onError:", err);
        },
      },
    );
    return new Response(stream, {
      status: context.statusCode,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("panellet SSR shell error:", err);
    return new Response(
      "<!doctype html><h1>500 — render failed</h1>",
      {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
});

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(\`panellet SSR listening on :\${port} (static: \${staticRoot})\`);
`;

mkdirSync(dirname(resolve(execroot, outServer)), { recursive: true });
writeFileSync(resolve(execroot, outServer), code);
