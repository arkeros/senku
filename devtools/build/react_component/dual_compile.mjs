/**
 * Dual-compile a route component source: produce the same TS/TSX module in
 * two flavors, where the client flavor has the server-only named exports
 * (`preload`, `meta`) stripped and any imports that became dead afterwards
 * swept out.
 *
 * Two cache entries, one per Bazel action; the alternative — relying on
 * tree-shaking to drop server-only code from the client bundle — would
 * silently break the moment any of those imports had a side-effect.
 *
 * Exports `transform()` so the same logic is unit-testable; the script
 * entry point reads/writes files for the Bazel rule wrapping it.
 *
 * Usage: dual_compile.mjs <src> --mode <client|server> --out-file <js>
 *        [--metadata-file <json>]
 */
import { transformSync } from "@babel/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const _require = createRequire(import.meta.url);
const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

export const SERVER_ONLY_EXPORTS = new Set(["preload", "meta"]);
export const MODES = new Set(["client", "server"]);

/**
 * Babel plugin that removes named exports listed in `serverOnlyExports`
 * (default: `preload`, `meta`) and prunes import specifiers whose local
 * binding becomes unreferenced once those exports are gone.
 *
 * Pass-only — never inspects type annotations or JSX, so it composes
 * cleanly with `@babel/preset-typescript` running in the same pipeline.
 */
export function stripServerOnlyExportsPlugin({ types: t }) {
  // Returns a sub-visitor specialized for one Program path, so the import
  // pruning step can resolve bindings against that program's scope.
  return {
    name: "panellet-strip-server-only-exports",
    visitor: {
      Program: {
        exit(programPath, state) {
          const drop =
            (state.opts && state.opts.serverOnlyExports) || SERVER_ONLY_EXPORTS;

          // Pass 1: remove the export declarations whose bound name is in `drop`.
          programPath.traverse({
            ExportNamedDeclaration(path) {
              const node = path.node;
              const decl = node.declaration;

              if (decl) {
                if (t.isVariableDeclaration(decl)) {
                  // `export const preload = ..., other = ...;` — keep `other`.
                  decl.declarations = decl.declarations.filter(
                    (d) => !(t.isIdentifier(d.id) && drop.has(d.id.name)),
                  );
                  if (decl.declarations.length === 0) {
                    path.remove();
                  }
                  return;
                }
                if (
                  (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) &&
                  decl.id &&
                  drop.has(decl.id.name)
                ) {
                  path.remove();
                  return;
                }
                return;
              }

              // `export { preload, other };` or `export { preload } from "...";`
              node.specifiers = node.specifiers.filter((s) => {
                const exported = s.exported;
                const exportedName = t.isIdentifier(exported)
                  ? exported.name
                  : exported && exported.value;
                return !drop.has(exportedName);
              });
              if (node.specifiers.length === 0) {
                path.remove();
              }
            },
          });

          // Recompute scope bindings after the removals so reference counts
          // reflect what the surviving program actually uses.
          programPath.scope.crawl();

          // Pass 2: prune import specifiers whose local binding is now unreferenced.
          programPath.traverse({
            ImportDeclaration(path) {
              const surviving = path.node.specifiers.filter((s) => {
                const binding = programPath.scope.getBinding(s.local.name);
                return Boolean(binding && binding.references > 0);
              });

              if (surviving.length === 0) {
                // Side-effect-only imports (no specifiers) and now-empty
                // imports both get removed; preserving "import 'foo'" with
                // no specifiers in the client bundle would re-import the
                // server-only side-effect anyway.
                path.remove();
                return;
              }
              path.node.specifiers = surviving;
            },
          });
        },
      },
    },
  };
}

/**
 * Run Babel on `code` for the given mode. Both modes apply preset-typescript
 * + preset-react/automatic so the output is plain ESM JS. The client mode
 * additionally runs `stripServerOnlyExportsPlugin`.
 *
 * `filename` is forwarded to Babel for source-map and error-message clarity.
 */
export function transform(code, { mode, filename = "input.tsx", sourceMaps = false } = {}) {
  if (!MODES.has(mode)) {
    throw new Error(`dual_compile: --mode must be one of ${[...MODES].join("|")}, got ${mode}`);
  }

  const plugins = [];
  if (mode === "client") {
    plugins.push(stripServerOnlyExportsPlugin);
  }

  const result = transformSync(code, {
    filename,
    configFile: false,
    babelrc: false,
    sourceMaps,
    presets: [
      _require.resolve("@babel/preset-typescript"),
      [_require.resolve("@babel/preset-react"), { runtime: "automatic" }],
    ],
    plugins,
  });

  if (!result || result.code == null) {
    throw new Error(`dual_compile: Babel produced no output for ${filename}`);
  }
  return result;
}

function parseArgs(argv) {
  const args = { srcFile: null, outFile: null, mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-file") args.outFile = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (!args.srcFile) args.srcFile = a;
    else throw new Error(`dual_compile: unexpected positional arg: ${a}`);
  }
  if (!args.srcFile || !args.outFile || !args.mode) {
    throw new Error("Usage: dual_compile.mjs <src> --mode <client|server> --out-file <js>");
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const absSrc = resolve(execroot, args.srcFile);
  const absOut = resolve(execroot, args.outFile);
  const absMap = absOut + ".map";

  const code = readFileSync(absSrc, "utf-8");
  const result = transform(code, {
    mode: args.mode,
    filename: args.srcFile,
    sourceMaps: true,
  });

  mkdirSync(dirname(absOut), { recursive: true });
  const mapName = absOut.split("/").pop() + ".map";
  writeFileSync(absOut, result.code + "\n//# sourceMappingURL=" + mapName + "\n");
  writeFileSync(absMap, JSON.stringify(result.map));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
