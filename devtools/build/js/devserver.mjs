/**
 * ESM dev server for React + StyleX components (Panellet framework).
 *
 * Serves Babel-compiled component JS as native ES modules. npm deps are
 * handled based on their manifest (produced by esm_bundle at build time):
 *   - ESM packages: served directly from node_modules (no bundling)
 *   - CJS packages: served from pre-bundled ESM files
 *
 * An import map is injected into index.html so the browser resolves
 * bare specifiers to the correct URLs.
 *
 * Usage: node devserver.mjs --js-dir <file> --css <file> --html <file>
 *        --manifest <file.json> [--manifest ...] [--port <n>]
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve, sep } from "node:path";
import mime from "mime";

// .mjs is served from the same origin as .js; `mime` returns
// "text/javascript" for both by default which is what modern browsers
// want. .map is JSON. For anything the user drops into an asset_library
// that mime doesn't know, we fall back to application/octet-stream —
// acceptable because the browser will still download it, just not
// render it inline.
function mimeFor(ext) {
  return mime.getType(ext) || "application/octet-stream";
}

// Parse args
const args = process.argv.slice(2);
let jsDirArg, cssFile, htmlFile, assetsManifestArg, assetsDirArg, runtimeConfigArg, port = 3000;
const manifestFiles = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--js-dir") jsDirArg = args[++i];
  else if (args[i] === "--css") cssFile = args[++i];
  else if (args[i] === "--html") htmlFile = args[++i];
  else if (args[i] === "--port") port = parseInt(args[++i], 10);
  else if (args[i] === "--manifest") manifestFiles.push(args[++i]);
  else if (args[i] === "--assets-manifest") assetsManifestArg = args[++i];
  else if (args[i] === "--assets-dir") assetsDirArg = args[++i];
  else if (args[i] === "--runtime-config") runtimeConfigArg = args[++i];
}

if (!jsDirArg || !cssFile || !htmlFile) {
  console.error("Usage: devserver.mjs --js-dir <file> --css <file> --html <file> --manifest <file> [--port <n>]");
  process.exit(1);
}

// Resolve paths from runfiles (js_binary cds into runfiles)
const runfiles = process.cwd();
const entryFile = jsDirArg.split("/").pop(); // e.g. "app_main.js"
const jsDir = dirname(resolve(runfiles, jsDirArg));
cssFile = resolve(runfiles, cssFile);
htmlFile = resolve(runfiles, htmlFile);

// Process manifests: build import map and file serving index
const importMap = {};
const servedFiles = {}; // url path -> absolute file path
let esmCount = 0;
let bundleCount = 0;

for (const mf of manifestFiles) {
  const manifestPath = resolve(runfiles, mf);
  const manifestDir = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Add import map entries. Don't overwrite entries from dedicated browser_dep
  // targets with transitive discoveries from ESM manifests (e.g. react-router
  // discovers "react" as CJS, but //devtools/build/js:react provides a bundled ESM).
  for (const [specifier, urlPath] of Object.entries(manifest.imports)) {
    if (!importMap[specifier]) {
      importMap[specifier] = urlPath;
    }
  }

  if (manifest.type === "esm") {
    // ESM: serve raw files from node_modules in runfiles
    for (const [urlPath, relPath] of Object.entries(manifest.files)) {
      servedFiles[urlPath] = resolve(runfiles, relPath);
    }
    esmCount++;
  } else if (manifest.type === "bundle-group") {
    // Bundle group: entry files + shared chunks in a directory (sibling to manifest)
    // The directory name matches the manifest name without .json
    const groupDir = manifestPath.replace(/\.json$/, "");
    for (const urlPath of Object.values(manifest.imports)) {
      const fileName = urlPath.split("/").pop();
      servedFiles[urlPath] = resolve(groupDir, fileName);
    }
    // Also serve shared chunks from the same directory
    for (const file of readdirSync(groupDir)) {
      if (file.endsWith(".js") && !servedFiles[`/deps/${file}`]) {
        servedFiles[`/deps/${file}`] = resolve(groupDir, file);
      }
    }
    bundleCount++;
  } else {
    // Bundle: serve the bundled .js file (sibling to manifest)
    const bundlePath = resolve(manifestDir, manifest.bundleFile);
    for (const urlPath of Object.values(manifest.imports)) {
      servedFiles[urlPath] = bundlePath;
    }
    bundleCount++;
  }
}

// Asset pipeline manifest (optional): maps `/assets/<hashed>` URLs to
// filenames inside the flat assets directory. The pipeline produces both
// together (manifest + sibling dir), so we resolve URLs against the dir.
let assetCount = 0;
if (assetsManifestArg && assetsDirArg) {
  const assetsManifestPath = resolve(runfiles, assetsManifestArg);
  const assetsDir = resolve(runfiles, assetsDirArg);
  const assetsManifest = JSON.parse(readFileSync(assetsManifestPath, "utf-8"));
  for (const [urlPath, fileName] of Object.entries(assetsManifest.urls || {})) {
    // Defense-in-depth: the manifest is internally produced by asset_pipeline,
    // not attacker input, but mirror the component-JS handler's containment
    // check so a future misconfiguration — or an accidental absolute path in
    // the manifest — can't escape the assets dir.
    const filePath = resolve(assetsDir, fileName);
    if (filePath !== assetsDir && !filePath.startsWith(assetsDir + sep)) {
      throw new Error(
        `devserver: asset manifest entry ${JSON.stringify(fileName)} resolves outside ${assetsDir}`,
      );
    }
    servedFiles[urlPath] = filePath;
    assetCount++;
  }
}

// Load runtime_config bootstrap (/env.js). Set window.__ENV__ before any
// module script runs so getEnv() reads populated values on first render.
const envJs = runtimeConfigArg ? readFileSync(resolve(runfiles, runtimeConfigArg), "utf-8") : null;

// Build index.html with import map
const originalHtml = readFileSync(htmlFile, "utf-8");
const mapJson = JSON.stringify({ imports: importMap }, null, 2);
const mapTag = `<script type="importmap">\n${mapJson}\n</script>`;
const envTag = envJs ? '<script src="/env.js"></script>\n    ' : "";
const indexHtml = originalHtml
  .replace("{{HEAD}}", `<link rel="stylesheet" href="/${cssFile.split("/").pop()}" />`)
  .replace("{{SCRIPTS}}", `${envTag}${mapTag}\n    <script type="module" src="/${entryFile}"></script>`);

// Reads are intentionally synchronous for simplicity — this is a dev server,
// not a production one, so the overhead doesn't matter.
createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(indexHtml);
    return;
  }

  if (envJs && url === "/env.js") {
    res.writeHead(200, { "Content-Type": mimeFor(".js") });
    res.end(envJs);
    return;
  }

  // Serve dep files (bundled CJS or raw ESM from node_modules)
  if (servedFiles[url]) {
    const ext = extname(url) || ".js";
    res.writeHead(200, { "Content-Type": mimeFor(ext) });
    res.end(readFileSync(servedFiles[url]));
    return;
  }

  if (url === "/" + cssFile.split("/").pop()) {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(readFileSync(cssFile));
    return;
  }

  // Serve component JS files (try .js extension for extensionless imports,
  // and /index.js for package-style imports that resolve to a directory).
  //
  // Resolution first tries paths under jsDir (same-package imports like
  // `./Layout` from `/app_main.js`), then falls back to runfiles root so
  // cross-package relative imports like `../../devtools/...` that the
  // browser normalizes to `/devtools/...` can still find their file. All
  // candidates are containment-checked against runfiles so a crafted URL
  // like `/../../etc/passwd` can't escape.
  let relPath;
  try {
    relPath = decodeURIComponent(url.slice(1));
  } catch {
    res.writeHead(400);
    res.end("Invalid URL encoding");
    return;
  }
  if (relPath.includes("\0")) {
    res.writeHead(400);
    res.end("Null byte in path");
    return;
  }
  const candidates = [
    join(jsDir, relPath),
    join(jsDir, relPath + ".js"),
    join(jsDir, relPath, "index.js"),
    join(runfiles, relPath),
    join(runfiles, relPath + ".js"),
    join(runfiles, relPath, "index.js"),
  ];
  for (const jsPath of candidates) {
    if (jsPath !== runfiles && !jsPath.startsWith(runfiles + sep)) continue;
    // existsSync returns true for directories too; only regular files are
    // servable. Without this check, a bare directory URL like `/devtools/...`
    // (no trailing /index.js) would readFileSync a directory and crash.
    if (existsSync(jsPath) && statSync(jsPath).isFile()) {
      const ext = extname(jsPath) || ".js";
      res.writeHead(200, { "Content-Type": mimeFor(ext) });
      res.end(readFileSync(jsPath));
      return;
    }
  }

  // SPA fallback: serve index.html for navigation requests (no file extension)
  // so client-side routing (react-router) can handle the path
  if (!extname(url)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(indexHtml);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(port, () => {
  console.log(`Dev server: http://localhost:${port}`);
  console.log(`  ${esmCount} ESM deps (served directly), ${bundleCount} CJS deps (bundled)`);
  console.log(`  ${Object.keys(importMap).length} import map entries`);
  if (assetCount > 0) {
    console.log(`  ${assetCount} static assets under /assets/`);
  }
});
