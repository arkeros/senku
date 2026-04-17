/**
 * Prepares an npm package for browser consumption.
 *
 * - CJS packages: bundles to a single ESM file with esbuild, discovering
 *   named exports via require()
 * - ESM packages: resolves the entry point and recursively discovers bare
 *   import specifiers to build an import map. No bundling needed.
 *
 * Outputs:
 *   - <name>.json: manifest describing how the devserver should serve this dep
 *   - <name>.js: bundled ESM file (CJS deps only, empty for ESM deps)
 *
 * Usage: node browser_dep.mjs --package <specifier> --output-js <file.js> --output-manifest <file.json>
 */
import { build } from "esbuild";
import { createRequire, builtinModules } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

const args = process.argv.slice(2);
let pkg = null;
let outputJs = null;
let outputManifest = null;
let forceBundle = false;
const externals = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--package") pkg = args[++i];
  else if (args[i] === "--output-js") outputJs = args[++i];
  else if (args[i] === "--output-manifest") outputManifest = args[++i];
  else if (args[i] === "--bundle") forceBundle = true;
  else if (args[i] === "--external") externals.push(args[++i]);
}

if (!pkg || !outputJs || !outputManifest) {
  console.error("Usage: browser_dep.mjs --package <specifier> --output-js <file.js> --output-manifest <file.json>");
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const cwd = process.cwd();
const require = createRequire(join(cwd, "package.json"));

/**
 * Resolve a package specifier, preferring the ESM entry via the "import"
 * condition in package.json exports, then "module" field, then "type": "module".
 * Falls back to CJS via require.resolve().
 */
function resolvePackage(specifier) {
  const rootPkg = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
  const subpath = specifier.slice(rootPkg.length + 1); // "" or "client" etc
  const exportKey = subpath ? "./" + subpath : ".";

  const pkgJsonPath = require.resolve(rootPkg + "/package.json");
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const pkgDir = dirname(pkgJsonPath);

  // Check exports field for an "import" condition
  if (pkgJson.exports?.[exportKey]) {
    const entry = pkgJson.exports[exportKey];
    // entry.import can be a string or nested {types, default}
    const importEntry = typeof entry === "string" ? null : entry.import;
    const importPath = typeof importEntry === "string" ? importEntry
      : typeof importEntry === "object" && importEntry?.default ? importEntry.default
      : null;
    if (importPath) {
      return { resolved: resolve(pkgDir, importPath), isESM: true };
    }
  }

  // Check top-level "module" field (legacy ESM convention)
  if (!subpath && pkgJson.module) {
    return { resolved: resolve(pkgDir, pkgJson.module), isESM: true };
  }

  // Check "type": "module"
  if (pkgJson.type === "module") {
    return { resolved: require.resolve(specifier), isESM: true };
  }

  // Fallback: CJS
  return { resolved: require.resolve(specifier), isESM: false };
}

const { resolved, isESM } = resolvePackage(pkg);

/**
 * Recursively discover bare import specifiers from an ESM file.
 * Returns a map of specifier -> resolved absolute file path.
 */
function discoverBareImports(filePath, seen = new Set()) {
  if (seen.has(filePath)) return {};
  seen.add(filePath);

  const content = readFileSync(filePath, "utf-8");
  const importMap = {};

  // Match: from "specifier" (handles multiline imports like import {\n...\n} from "...")
  const re = /\bfrom\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(re)) {
    const spec = match[1];

    if (spec.startsWith(".") || spec.startsWith("/")) {
      // Relative import — resolve and recurse
      const absPath = resolveRelativeImport(filePath, spec);
      if (absPath) {
        Object.assign(importMap, discoverBareImports(absPath, seen));
      }
    } else {
      // Bare specifier — resolve and add to map
      try {
        const dep = resolvePackage(spec);
        importMap[spec] = dep.resolved;
        // Recurse into ESM deps
        if (dep.isESM) {
          Object.assign(importMap, discoverBareImports(dep.resolved, seen));
        }
      } catch (err) {
        // Node.js builtins can't be resolved via require.resolve — expected,
        // skip silently. Anything else (broken symlink, corrupt package.json,
        // permissions) is a real problem worth surfacing.
        const bareName = spec.replace(/^node:/, "").split("/")[0];
        if (!builtinModules.includes(bareName)) {
          console.warn(
            `browser_dep: failed to resolve "${spec}" in ${filePath}: ${err.message}`,
          );
        }
      }
    }
  }

  return importMap;
}

function resolveRelativeImport(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, base + ".js", base + ".mjs", join(base, "index.js"), join(base, "index.mjs")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const absOutputJs = resolve(execroot, outputJs);
const absOutputManifest = resolve(execroot, outputManifest);

for (const f of [absOutputJs, absOutputManifest]) {
  mkdirSync(dirname(f), { recursive: true });
}

if (isESM && !forceBundle) {
  // Find the node_modules root to compute serve paths
  const nodeModulesIdx = resolved.indexOf("/node_modules/");
  if (nodeModulesIdx === -1) {
    throw new Error(`Expected resolved path to contain /node_modules/: ${resolved}`);
  }
  const nodeModulesRoot = resolved.substring(0, nodeModulesIdx + "/node_modules/".length);
  const entryServePath = "/node_modules/" + relative(nodeModulesRoot, resolved);

  // Walk all files reachable from the entry, collecting:
  // - files: relative imports (chunks) that need to be served
  // - imports: bare specifiers that need import map entries
  const files = {};
  const imports = { [pkg]: entryServePath };
  const seen = new Set();

  function walk(filePath) {
    if (seen.has(filePath)) return;
    seen.add(filePath);

    const relPath = "node_modules/" + relative(nodeModulesRoot, filePath);
    files["/" + relPath] = relPath;

    const content = readFileSync(filePath, "utf-8");
    const re = /\bfrom\s+["']([^"']+)["']/g;
    for (const match of content.matchAll(re)) {
      const spec = match[1];
      if (spec.startsWith(".") || spec.startsWith("/")) {
        // Relative import — resolve and walk
        const abs = resolveRelativeImport(filePath, spec);
        if (abs) walk(abs);
      } else if (!imports[spec]) {
        // Bare specifier — add to import map
        try {
          const dep = resolvePackage(spec);
          imports[spec] = "/node_modules/" + relative(nodeModulesRoot, dep.resolved);
        } catch {
          // Can't resolve (Node.js builtin, etc.)
        }
      }
    }
  }
  walk(resolved);

  const manifest = { type: "esm", imports, files };
  writeFileSync(absOutputManifest, JSON.stringify(manifest, null, 2));
  writeFileSync(absOutputJs, "// ESM package served directly — see manifest\n");
} else if (isESM && forceBundle) {
  // ESM force-bundled: bundle the resolved entry but keep other browser_dep
  // packages external so there's only one copy of react, react-dom, etc.
  await build({
    entryPoints: [resolved],
    bundle: true,
    format: "esm",
    outfile: absOutputJs,
    platform: "browser",
    external: externals,
    logLevel: "warning",
  });

  const safeName = pkg.replace(/[@/]/g, "_") + ".js";
  const jsFilename = outputJs.split("/").pop();
  const manifest = {
    type: "bundle",
    imports: { [pkg]: `/deps/${safeName}` },
    bundleFile: jsFilename,
  };
  writeFileSync(absOutputManifest, JSON.stringify(manifest, null, 2));
} else {
  // CJS: bundle with esbuild, discovering named exports via require()
  const mod = require(pkg);
  const names = Object.keys(mod).filter(k => k !== "default" && k !== "__esModule");

  const stub = join(cwd, `_esm_stub_${pkg.replace(/[@/]/g, "_")}.js`);
  const lines = [`import * as __mod from "${pkg}";`];
  if (names.length) {
    lines.push(`const { ${names.join(", ")} } = __mod;`);
    lines.push(`export { ${names.join(", ")} };`);
  }
  lines.push(`export default __mod;`);
  writeFileSync(stub, lines.join("\n") + "\n");

  await build({
    entryPoints: [stub],
    bundle: true,
    format: "esm",
    outfile: absOutputJs,
    platform: "browser",
    external: externals,
    logLevel: "warning",
  });

  const safeName = pkg.replace(/[@/]/g, "_") + ".js";
  // Store just the .js filename — it's always sibling to the manifest
  const jsFilename = outputJs.split("/").pop();
  const manifest = {
    type: "bundle",
    imports: { [pkg]: `/deps/${safeName}` },
    bundleFile: jsFilename,
  };
  writeFileSync(absOutputManifest, JSON.stringify(manifest, null, 2));
}
