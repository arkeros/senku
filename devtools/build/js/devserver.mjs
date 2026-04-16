/**
 * ESM dev server for React + StyleX components (Panallet framework).
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
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".map": "application/json",
};

// Parse args
const args = process.argv.slice(2);
let jsDirArg, cssFile, htmlFile, port = 3000;
const manifestFiles = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--js-dir") jsDirArg = args[++i];
  else if (args[i] === "--css") cssFile = args[++i];
  else if (args[i] === "--html") htmlFile = args[++i];
  else if (args[i] === "--port") port = parseInt(args[++i], 10);
  else if (args[i] === "--manifest") manifestFiles.push(args[++i]);
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
    const { readdirSync } = await import("node:fs");
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

// Build index.html with import map
const originalHtml = readFileSync(htmlFile, "utf-8");
const mapJson = JSON.stringify({ imports: importMap }, null, 2);
const mapTag = `<script type="importmap">\n${mapJson}\n</script>`;
const indexHtml = originalHtml
  .replace("{{HEAD}}", `<link rel="stylesheet" href="/${cssFile.split("/").pop()}" />`)
  .replace("{{SCRIPTS}}", `${mapTag}\n    <script type="module" src="/${entryFile}"></script>`);

createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(indexHtml);
    return;
  }

  // Serve dep files (bundled CJS or raw ESM from node_modules)
  if (servedFiles[url]) {
    const ext = extname(url) || ".js";
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/javascript" });
    res.end(readFileSync(servedFiles[url]));
    return;
  }

  if (url === "/" + cssFile.split("/").pop()) {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(readFileSync(cssFile));
    return;
  }

  // Serve component JS files (try .js extension for extensionless imports)
  const relPath = url.slice(1);
  const candidates = [join(jsDir, relPath), join(jsDir, relPath + ".js")];
  for (const jsPath of candidates) {
    if (existsSync(jsPath)) {
      const ext = extname(jsPath) || ".js";
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
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
});
