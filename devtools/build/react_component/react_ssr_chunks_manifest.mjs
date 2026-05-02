/**
 * Post-process esbuild's metafile into the source-path → chunks map
 * the SSR server uses for `<link rel="modulepreload">` emission.
 *
 * esbuild's metafile records, for each output chunk:
 *   - `entryPoint`: the *source* path that produced the chunk (only set
 *      for entries — top-level + each dynamic-import target).
 *   - `imports[]`: the chunks this one imports at module-init time.
 *
 * For a route's dynamic `import("./Foo.client.js")` we want every chunk
 * that has to be loaded before `Foo.client`'s exports are usable: the
 * route's own chunk plus the transitive closure of its `imports` (the
 * shared `chunk-XXXX.js` that holds react/react-router/etc.).
 *
 * Output shape (one entry per dynamic-import entry chunk):
 *   {
 *     "<source-import-path>": ["<url1>", "<url2>", ...],
 *     ...
 *   }
 * — the source-import-path matches the path the codegen emits in
 * `lazy: () => import("./Foo.client")`, with `.js` stripped, so the
 * server can look up matched routes by the manifest's `import` field.
 *
 * Usage: node react_ssr_chunks_manifest.mjs
 *          --metafile <esbuild metafile json>
 *          --out <chunks json>
 *          --url-prefix <prefix> (e.g. "/foo_client_bundle/")
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let metafileArg, outArg, urlPrefix;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--metafile") metafileArg = args[++i];
  else if (args[i] === "--out") outArg = args[++i];
  else if (args[i] === "--url-prefix") urlPrefix = args[++i];
}

if (!metafileArg || !outArg || !urlPrefix) {
  console.error(
    "Usage: react_ssr_chunks_manifest.mjs --metafile <f> --out <f> --url-prefix <p>",
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const metafile = JSON.parse(readFileSync(resolve(execroot, metafileArg), "utf-8"));

// Build a graph: outputPath → list of imported outputPaths
const importGraph = new Map();
for (const [outputPath, info] of Object.entries(metafile.outputs)) {
  const imports = (info.imports ?? [])
    .filter((imp) => imp.kind === "import-statement" || imp.kind === "dynamic-import")
    .map((imp) => imp.path);
  importGraph.set(outputPath, imports);
}

// Walk the transitive closure of imports starting from a given output.
function transitiveImports(start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of importGraph.get(cur) ?? []) {
      stack.push(next);
    }
  }
  return seen;
}

// For each output that has an entryPoint AND is itself the result of
// a dynamic import (heuristic: filename matches `<stem>-<8+ char hash>.js`
// AND has an entryPoint), record the entryPoint's stem (extension
// stripped) → list of chunk URLs. We skip the main entry (the entry
// chunk that doesn't end in `-HASH.js`) because main is loaded via the
// page's `<script type="module">` tag directly.
const HASHED_CHUNK_RE = /^.+-[A-Z0-9]{6,}\.js$/;
const sourceToChunks = {};

for (const [outputPath, info] of Object.entries(metafile.outputs)) {
  if (!info.entryPoint) continue;
  if (!HASHED_CHUNK_RE.test(basename(outputPath))) continue;

  // Map the entryPoint source path back to the bare specifier the codegen
  // emitted. Source paths from esbuild are like
  // `<package>/<file>.client.js` (or `bazel-out/.../bin/<package>/<file>.client.js`
  // when running with config-trimmed paths). The codegen's
  // `import("./X.client")` references the file by its name (no
  // bazel-out prefix), so we strip the `.js` and key on the basename's
  // stem — `Foo.client` matches the manifest's `import: "./pages/Foo.client"`
  // suffix; the server walks matched routes and does an endsWith match.
  const entryStem = info.entryPoint.replace(/\.js$/, "");

  const chunks = Array.from(transitiveImports(outputPath));
  // Sort for stable output; the entry chunk first (so the matched
  // route's own bytes start downloading before its shared deps).
  chunks.sort((a, b) => {
    if (a === outputPath) return -1;
    if (b === outputPath) return 1;
    return a.localeCompare(b);
  });

  sourceToChunks[entryStem] = chunks.map((c) => urlPrefix + basename(c));
}

mkdirSync(dirname(resolve(execroot, outArg)), { recursive: true });
writeFileSync(resolve(execroot, outArg), JSON.stringify(sourceToChunks, null, 2));
