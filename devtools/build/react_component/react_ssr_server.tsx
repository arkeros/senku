/// <reference types="node" />
/**
 * SSR server for panellet's `react_ssr_app` (sibling to
 * `//devtools/build/js:devserver.mjs` for the SPA flow). Same script
 * runs in dev (via `bazel run :{name}_devserver`) and in prod (the
 * binary `image_from_binary` ships into the OCI image as
 * `:{name}_server`); the per-app shape lives entirely in the manifests
 * this script reads at boot:
 *
 *   * `--route-manifest`         react_app_manifest output: layout +
 *                                 routes with import paths + export names.
 *                                 Each route component is dynamic-imported
 *                                 at boot (Node ESM resolves through
 *                                 runfiles' node_modules); the script
 *                                 builds the createStaticHandler routes
 *                                 config from those modules' exports.
 *   * `--browser-deps-manifest`  one per browser_dep, dev-only; same
 *                                 merging rules as `devserver.mjs`
 *                                 (esm / bundle / bundle-group).
 *
 * Mode determination — exactly one of these flags is required, and the
 * one that's set selects the rest of the behavior:
 *
 *   `--client-bundle-url <url>`  prod: reference esbuild's bundled
 *                                 client at this URL. No importmap, no
 *                                 /_components or /_modules handlers.
 *   `--client-main-url <url>`    dev: reference the unbundled
 *                                 `{name}_client_main.js` at this URL.
 *                                 Adds importmap + /_modules + /_components
 *                                 (raw runfiles serving).
 *
 * Compiled in @senku (`ts_project` → `.js`, copy_file → `.mjs`) and
 * shipped as a single `.mjs` consumers `copy_file` into their package
 * — no per-consumer ts_project compile, no per-app codegen.
 *
 * Usage: node react_ssr_server.mjs
 *          --route-manifest <file.json>
 *          --static-dir <dir>
 *          (--client-bundle-url <url> | --client-main-url <url>)
 *          [--browser-deps-manifest <file.json> ...]
 *          [--app-title <string>]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { StrictMode, Suspense, type ComponentType, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";

const ASSET_PATH_RE = /\.[a-z0-9]+$/i;

// --- args -----------------------------------------------------------------

const args = process.argv.slice(2);
let routeManifestArg: string | null = null;
let staticDirArg: string | null = null;
let clientBundleUrl: string | null = null;
let clientMainUrl: string | null = null;
let appTitle = "panellet";
const browserManifestArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--route-manifest") routeManifestArg = args[++i];
  else if (args[i] === "--browser-deps-manifest") browserManifestArgs.push(args[++i]);
  else if (args[i] === "--static-dir") staticDirArg = args[++i];
  else if (args[i] === "--client-bundle-url") clientBundleUrl = args[++i];
  else if (args[i] === "--client-main-url") clientMainUrl = args[++i];
  else if (args[i] === "--app-title") appTitle = args[++i];
}

if (!routeManifestArg || !staticDirArg) {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: react_ssr_server.mjs --route-manifest <file> --static-dir <dir> (--client-bundle-url <url> | --client-main-url <url>) [--browser-deps-manifest <f> ...] [--app-title <s>]",
  );
  process.exit(1);
}

const isDev = clientMainUrl != null && clientBundleUrl == null;
const isProd = clientBundleUrl != null && clientMainUrl == null;
if (isDev === isProd) {
  // eslint-disable-next-line no-console
  console.error(
    "react_ssr_server: exactly one of --client-bundle-url (prod) or --client-main-url (dev) is required",
  );
  process.exit(1);
}

const runfiles = process.cwd();
const routeManifestPath = resolve(runfiles, routeManifestArg);
const routeManifestDir = dirname(routeManifestPath);
const staticRoot = resolve(runfiles, staticDirArg);

// --- manifest types --------------------------------------------------------

interface BrowserDepManifest {
  type?: "esm" | "bundle" | "bundle-group";
  imports?: Record<string, string>;
  files?: Record<string, string>;
  bundleFile?: string;
}

interface RouteManifestEntry {
  path: string;
  import?: string;
  name?: string;
  error_import?: string;
  error_name?: string;
  children?: RouteManifestEntry[];
}

interface RouteManifest {
  layout: RouteManifestEntry;
  routes: RouteManifestEntry[];
}

const routeManifest = JSON.parse(readFileSync(routeManifestPath, "utf-8")) as RouteManifest;

// --- browser_dep manifests → importmap + servedFiles -----------------------

const importMap: { imports: Record<string, string> } = { imports: {} };
const servedFiles = new Map<string, string>();

for (const rel of browserManifestArgs) {
  const manifestPath = resolve(runfiles, rel);
  const manifestDir = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BrowserDepManifest;
  for (const [specifier, urlPath] of Object.entries(manifest.imports ?? {})) {
    if (!importMap.imports[specifier]) {
      importMap.imports[specifier] = urlPath;
    }
  }
  if (manifest.type === "esm" && manifest.files) {
    for (const [urlPath, relPath] of Object.entries(manifest.files)) {
      servedFiles.set(urlPath, resolve(runfiles, relPath));
    }
  } else if (manifest.type === "bundle-group" && manifest.imports) {
    const groupDir = manifestPath.replace(/\.json$/, "");
    for (const urlPath of Object.values(manifest.imports)) {
      const fileName = urlPath.split("/").pop();
      if (fileName) servedFiles.set(urlPath, resolve(groupDir, fileName));
    }
    if (existsSync(groupDir) && statSync(groupDir).isDirectory()) {
      for (const file of readdirSync(groupDir)) {
        if (file.endsWith(".js")) {
          const url = `/deps/${file}`;
          if (!servedFiles.has(url)) servedFiles.set(url, resolve(groupDir, file));
        }
      }
    }
  } else if (manifest.bundleFile && manifest.imports) {
    const bundlePath = resolve(manifestDir, manifest.bundleFile);
    for (const urlPath of Object.values(manifest.imports)) {
      servedFiles.set(urlPath, bundlePath);
    }
  }
}

const importMapJson = JSON.stringify(importMap);

// --- route manifest → routes config (dynamic-imported components) ----------

async function importComponent(relPath: string, exportName: string): Promise<ComponentType<unknown>> {
  const abs = resolve(routeManifestDir, `${relPath}.js`);
  const mod = await import(abs);
  const value = mod[exportName];
  if (!value) {
    throw new Error(
      `react_ssr_devserver: ${relPath}.js has no export "${exportName}"`,
    );
  }
  return value as ComponentType<unknown>;
}

async function realizeRoute(entry: RouteManifestEntry): Promise<RouteObject> {
  const out: Record<string, unknown> = entry.path === "/"
    ? { index: true }
    : { path: entry.path };
  if (entry.import && entry.name) {
    out.Component = await importComponent(entry.import, entry.name);
  }
  if (entry.error_import && entry.error_name) {
    const Err = await importComponent(entry.error_import, entry.error_name);
    out.errorElement = <Err />;
  }
  if (entry.children && entry.children.length > 0) {
    out.children = await Promise.all(entry.children.map(realizeRoute));
  }
  return out as RouteObject;
}

const layoutEntry: RouteObject = await (async () => {
  const out: Record<string, unknown> = {
    path: "/",
    Component: await importComponent(
      routeManifest.layout.import!,
      routeManifest.layout.name!,
    ),
  };
  if (routeManifest.layout.error_import && routeManifest.layout.error_name) {
    const Err = await importComponent(
      routeManifest.layout.error_import,
      routeManifest.layout.error_name,
    );
    out.errorElement = <Err />;
  }
  if (routeManifest.routes && routeManifest.routes.length > 0) {
    out.children = await Promise.all(routeManifest.routes.map(realizeRoute));
  }
  return out as RouteObject;
})();

const handler = createStaticHandler([layoutEntry]);

// --- Document --------------------------------------------------------------

function Document({
  children,
  hydrationData,
}: { children: ReactNode; hydrationData: string }) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{appTitle}</title>
      </head>
      <body>
        <div id="root">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__staticRouterHydrationData = ${hydrationData};`,
          }}
        />
        {isDev ? (
          <>
            <script
              type="importmap"
              dangerouslySetInnerHTML={{ __html: importMapJson }}
            />
            <script type="module" src={clientMainUrl!} />
          </>
        ) : (
          <script type="module" src={clientBundleUrl!} />
        )}
      </body>
    </html>
  );
}

// --- Hono ------------------------------------------------------------------

const app = new Hono();

// Stage 1: bundled assets (CSS, hashed assets) under the static-dir.
app.use("*", serveStatic({ root: staticRoot }));

// Stage 2: manifest-driven module file serving. Heterogeneous URL
// prefixes (`/deps/...`, `/node_modules/.../...`), so match every URL
// and consult `servedFiles` rather than scoping to a single prefix.
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const file = servedFiles.get(path);
  if (file && existsSync(file)) {
    return new Response(readFileSync(file), {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  }
  return next();
});

// Stage 3: raw `.js` from runfiles, served at /_components/*.
// Defense-in-depth: reject `..` / NUL traversal; containment-check the
// resolved path against the runfiles root.
app.use("/_components/*", async (c, next) => {
  const rel = decodeURIComponent(
    new URL(c.req.url).pathname.slice("/_components/".length),
  );
  if (rel.includes("\0") || rel.split("/").includes("..")) {
    return next();
  }
  const candidates = [
    resolve(runfiles, rel),
    resolve(runfiles, rel + ".js"),
    resolve(runfiles, rel, "index.js"),
  ];
  for (const candidate of candidates) {
    if (
      (candidate === runfiles || candidate.startsWith(runfiles + sep)) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
    ) {
      return new Response(readFileSync(candidate), {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }
  }
  return next();
});

// Stage 4: SSR catch-all. Asset-extensioned URLs failed all upstream
// stages, so 404 directly — keeps react-router's default ErrorBoundary
// from logging every browser auto-fetch (favicon.ico, /deps/X.js, …).
app.all("*", async (c) => {
  if (ASSET_PATH_RE.test(new URL(c.req.url).pathname)) {
    return c.body("Not Found", 404);
  }
  const context = await handler.query(c.req.raw);
  if (context instanceof Response) return context;

  const router = createStaticRouter(handler.dataRoutes, context);

  try {
    const hydrationData = JSON.stringify({
      loaderData: context.loaderData,
      actionData: context.actionData,
      errors: context.errors,
    }).replace(/</g, "\\u003c");
    const stream = await renderToReadableStream(
      <Document hydrationData={hydrationData}>
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
    return new Response("<!doctype html><h1>500 — render failed</h1>", {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`panellet SSR dev: http://localhost:${port}`);
// eslint-disable-next-line no-console
console.log(`  ${Object.keys(importMap.imports).length} importmap entries`);
