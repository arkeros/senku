/**
 * Bundles multiple CJS packages together with esbuild splitting mode.
 *
 * Each package gets its own entry file, but shared code (like React internals)
 * goes into a common chunk. This ensures only one copy of React exists across
 * react, react/jsx-runtime, and react-dom/client.
 *
 * Usage: node browser_dep_group.mjs --outdir <dir> --manifest <file.json> --package <spec> [--package <spec> ...]
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
let outdir = null;
let manifestFile = null;
const packages = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--outdir") outdir = args[++i];
  else if (args[i] === "--manifest") manifestFile = args[++i];
  else if (args[i] === "--package") packages.push(args[++i]);
}

if (!outdir || !manifestFile || packages.length === 0) {
  console.error("Usage: browser_dep_group.mjs --outdir <dir> --manifest <file.json> --package <spec> [...]");
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const cwd = process.cwd();
// browser_dep_group targets are instantiated in the consumer's BUILD via
// panallet_browser_modules, so cwd is the consumer's workspace.
const require = createRequire(join(cwd, "package.json"));

const absOutdir = resolve(execroot, outdir);
mkdirSync(absOutdir, { recursive: true });

// Create one stub per package, discovering named exports
const entryPoints = {};
for (const pkg of packages) {
  const mod = require(pkg);
  const names = Object.keys(mod).filter(k => k !== "default" && k !== "__esModule");
  const safeName = pkg.replace(/[@/]/g, "_");

  const stub = join(cwd, `_group_stub_${safeName}.js`);
  const lines = [`import * as __mod from "${pkg}";`];
  if (names.length) {
    lines.push(`const { ${names.join(", ")} } = __mod;`);
    lines.push(`export { ${names.join(", ")} };`);
  }
  lines.push(`export default __mod;`);
  writeFileSync(stub, lines.join("\n") + "\n");

  entryPoints[safeName] = stub;
}

await build({
  entryPoints,
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: absOutdir,
  platform: "browser",
  logLevel: "warning",
});

// Build manifest: each package maps to its output file
const imports = {};
for (const pkg of packages) {
  const safeName = pkg.replace(/[@/]/g, "_");
  imports[pkg] = `/deps/${safeName}.js`;
}

const manifest = { type: "bundle-group", imports };
mkdirSync(dirname(resolve(execroot, manifestFile)), { recursive: true });
writeFileSync(resolve(execroot, manifestFile), JSON.stringify(manifest, null, 2));
