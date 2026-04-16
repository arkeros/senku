/**
 * Transpiles a single TypeScript/TSX file with Babel and extracts StyleX metadata.
 *
 * Outputs:
 *   - .js file (transpiled source)
 *   - .js.map file (source map)
 *   - .stylex.json file (StyleX CSS metadata for later collection)
 *
 * Usage: node stylex_transpile.mjs <src> --out-file <js> --metadata-file <json> [--config-file <cfg>]
 */
import { transformSync } from "@babel/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let srcFile = null;
let outFile = null;
let metadataFile = null;
let configFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out-file") {
    outFile = args[++i];
  } else if (args[i] === "--metadata-file") {
    metadataFile = args[++i];
  } else if (args[i] === "--config-file") {
    configFile = args[++i];
  } else if (!srcFile) {
    srcFile = args[i];
  }
}

if (!srcFile || !outFile || !metadataFile) {
  console.error(
    "Usage: stylex_transpile.mjs <src> --out-file <js> --metadata-file <json> [--config-file <cfg>]"
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const absSrc = resolve(execroot, srcFile);
const code = readFileSync(absSrc, "utf-8");

const babelOptions = { filename: absSrc, sourceMaps: true };

if (configFile) {
  babelOptions.configFile = resolve(execroot, configFile);
} else {
  babelOptions.presets = [
    "@babel/preset-typescript",
    ["@babel/preset-react", { runtime: "automatic" }],
  ];
  babelOptions.plugins = ["@stylexjs/babel-plugin"];
}

const result = transformSync(code, babelOptions);

const absOut = resolve(execroot, outFile);
const absMap = absOut + ".map";
const absMetadata = resolve(execroot, metadataFile);

for (const f of [absOut, absMetadata]) {
  mkdirSync(dirname(f), { recursive: true });
}

writeFileSync(absOut, result.code + "\n//# sourceMappingURL=" + outFile.split("/").pop() + ".map\n");
writeFileSync(absMap, JSON.stringify(result.map));
writeFileSync(absMetadata, JSON.stringify(result.metadata?.stylex ?? []));
