/**
 * Generates the prod `{name}_server.tsx` Hono entry from a
 * react_app_manifest JSON.
 *
 * Static imports for every route component so esbuild can fold them
 * into a single Node bundle. The Document references the
 * `--client-bundle-url` (the esbuild client output URL) so the prod
 * OCI image only ships the bundled client.
 *
 * The dev path doesn't go through this script — `react_ssr_devserver.mjs`
 * is a static, ts-project-free .mjs that reads the same manifest at
 * boot and dynamic-imports the route components instead.
 *
 * Both modes use:
 *   - `createStaticHandler(routes)` to run the matched-route chain.
 *   - `renderToReadableStream` from `react-dom/server.edge` (ESM-native,
 *     Web streams), so the result drops directly into a Hono Response
 *     without the `createRequire` shim that `server.node` (CJS) needs.
 *
 * Usage: node react_ssr_app_codegen.mjs --manifest <file.json>
 *        --out-server <file.tsx>
 *        --client-bundle-url <url>
 *        [--app-title <string>]
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

if (!manifestFile || !outServer || !clientBundleUrl) {
  console.error(
    "Usage: react_ssr_app_codegen.mjs --manifest <file> --out-server <file> --client-bundle-url <url>",
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

// Append `.js` so the dev server (Node ESM) resolves the import to the
// concrete ts_project output without further extension search. Harmless
// in the prod bundle: esbuild treats `./X` and `./X.js` the same.
const importLines = Array.from(importTable.values())
  .map(({ name, path, localName }) =>
    localName === name
      ? `import { ${name} } from "${path}.js";`
      : `import { ${name} as ${localName} } from "${path}.js";`,
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

// Omit `children` entirely when no child routes — react-router treats
// an empty `children: []` differently from "no children": with the
// empty array it appears to render the layout twice (once as match,
// once as the implied-empty leaf), producing `<root><script><root>`
// in the streamed HTML. Drop the key when empty.
const childrenBlock = routeEntries.length > 0
  ? `    children: [\n${routeEntries.join(",\n")},\n    ],`
  : "";

// Title is JSON-encoded into the source so quotes / backslashes can't
// break out of the string literal; HTML-escaping is React's job at
// render time, not the codegen's.
const titleLiteral = JSON.stringify(title);
const clientBundleUrlLiteral = JSON.stringify(clientBundleUrl);

// Shared blocks — identical in both prod and dev entries.
const sharedRouterBlock = `const routes: RouteObject[] = [
  {
    path: "/",
    Component: ${layoutLocal},
${layoutErrorLine}${childrenBlock}
  },
];

const handler = createStaticHandler(routes);`;

// Asset-shaped paths (extensions like .js, .css, .png, favicon.ico,
// apple-touch-icon.png …) shouldn't reach the SSR catch-all — they
// failed upstream static / module / component lookups. Returning 404
// directly avoids react-router's default ErrorBoundary logging every
// browser auto-fetch. Anything ending in a dotted suffix counts.
const sharedAssetSkip = `const ASSET_PATH_RE = /\\.[a-z0-9]+$/i;`;

const sharedRenderHandler = `app.all("*", async (c) => {
  if (ASSET_PATH_RE.test(new URL(c.req.url).pathname)) {
    return c.body("Not Found", 404);
  }

  const context = await handler.query(c.req.raw);
  if (context instanceof Response) {
    return context;
  }

  const router = createStaticRouter(handler.dataRoutes, context);

  try {
    // \`hydrate={false}\` suppresses StaticRouterProvider's auto-emitted
    // <script> tag (the one that sets window.__staticRouterHydrationData).
    // We emit it ourselves inside <Document> so React 19's
    // renderToReadableStream sees it as a normal HTML element rather than
    // a late-streaming injection — the latter caused the route tree to
    // appear twice in the output.
    const hydrationData = JSON.stringify({
      loaderData: context.loaderData,
      actionData: context.actionData,
      errors: context.errors,
    }).replace(/</g, "\\\\u003c");
    const stream = await renderToReadableStream(
      <Document hydrationData={hydrationData}>
        {/*
          <StrictMode> + <Suspense> mirror the wrappers in
          client_main.tsx so React's hydration sees identical tree
          shape on both sides — the streamed HTML carries the boundary's
          resolved content + its hydration markers, and the client's
          lazy chunk resolves into the same boundary without triggering
          a mismatch (error #418). StrictMode is a no-op on the server.
        */}
        <StrictMode>
          <Suspense fallback={null}>
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </Suspense>
        </StrictMode>
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
});`;

const sharedFooter = `const port = Number.parseInt(process.env.PORT ?? "8080", 10);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(\`panellet SSR listening on :\${port}\`);`;

const sharedHeadMeta = `      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{${titleLiteral}}</title>
      </head>`;

const sharedHydrationScript = `        <script
          dangerouslySetInnerHTML={{
            __html: \`window.__staticRouterHydrationData = \${hydrationData};\`,
          }}
        />`;

function generateProdEntry() {
  return `/// <reference types="node" />
// Generated by react_ssr_app (--mode prod) — do not edit.
import { StrictMode, Suspense, type ReactNode } from "react";
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

const CLIENT_BUNDLE_URL = ${clientBundleUrlLiteral};

// Document wraps the matched route tree in a full HTML document so
// renderToReadableStream emits everything from <!DOCTYPE> on. Step 9
// will thread per-route <meta>/title in here from the matched chain.
function Document({
  children,
  hydrationData,
}: { children: ReactNode; hydrationData: string }) {
  return (
    <html>
${sharedHeadMeta}
      <body>
        <div id="root">{children}</div>
${sharedHydrationScript}
        <script type="module" src={CLIENT_BUNDLE_URL} />
      </body>
    </html>
  );
}

${sharedRouterBlock}

const staticRoot = process.env.PANELLET_STATIC_DIR ?? "./static";

const app = new Hono();

// Single \`serveStatic\` for every URL: hashed asset paths (\`/assets/...\`),
// CSS sheets (\`/{name}_styles.css\`), and the client bundle directory
// (\`/{name}_client_bundle/main.js\` + lazy chunks) all resolve under
// \`staticRoot\`. Non-existent files fall through to the SSR catch-all
// below, so route URLs like \`/about\` aren't shadowed.
app.use("*", serveStatic({ root: staticRoot }));

${sharedAssetSkip}

${sharedRenderHandler}

${sharedFooter}
`;
}

const code = generateProdEntry();

mkdirSync(dirname(resolve(execroot, outServer)), { recursive: true });
writeFileSync(resolve(execroot, outServer), code);
