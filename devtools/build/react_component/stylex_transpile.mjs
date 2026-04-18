/**
 * Transpiles a single TypeScript/TSX file with Babel and extracts StyleX metadata.
 *
 * Outputs:
 *   - .js file (transpiled source)
 *   - .js.map file (source map)
 *   - .stylex.json file (StyleX CSS metadata for later collection)
 *
 * Usage: node stylex_transpile.mjs <src> --out-file <js> --metadata-file <json>
 */
import { transformSync } from "@babel/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
let srcFile = null;
let outFile = null;
let metadataFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out-file") {
    outFile = args[++i];
  } else if (args[i] === "--metadata-file") {
    metadataFile = args[++i];
  } else if (!srcFile) {
    srcFile = args[i];
  }
}

if (!srcFile || !outFile || !metadataFile) {
  console.error(
    "Usage: stylex_transpile.mjs <src> --out-file <js> --metadata-file <json>"
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const bindir = resolve(execroot, process.env.BAZEL_BINDIR || ".");
const absSrc = resolve(execroot, srcFile);
const code = readFileSync(absSrc, "utf-8");

// Use the bin-dir path as filename. The source file is also copied to
// bindir by ts_project, so defineVars resolution finds the .ts source
// and generates consistent hashes across targets.
const babelOptions = {
  filename: resolve(bindir, srcFile),
  sourceMaps: true,
  // Don't load babel.config.json — configure everything here so we can
  // set rootDir to the bindir for consistent defineVars hashes
  configFile: false,
  presets: [
    "@babel/preset-typescript",
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
  plugins: [
    ["@stylexjs/babel-plugin", {
      unstable_moduleResolution: {
        type: "custom",
        rootDir: bindir,
        // Strip file extension so .ts/.tsx/.js all produce the same hash.
        // This ensures defineVars hashes match across Bazel targets.
        getCanonicalFilePath: (filePath) => {
          return relative(bindir, resolve(filePath)).replace(/\.[cm]?[jt]sx?$/, "");
        },
        filePathResolver: (importPath, sourceFilePath) => {
          if (importPath.startsWith(".")) {
            return resolve(dirname(sourceFilePath), importPath);
          }
          return null;
        },
      },
    }],
  ],
};

const result = transformSync(code, babelOptions);

if (!result || result.code == null) {
  console.error(`Babel transformation failed for ${srcFile}`);
  process.exit(1);
}

const absOut = resolve(execroot, outFile);
const absMap = absOut + ".map";
const absMetadata = resolve(execroot, metadataFile);

for (const f of [absOut, absMetadata]) {
  mkdirSync(dirname(f), { recursive: true });
}

writeFileSync(absOut, result.code + "\n//# sourceMappingURL=" + outFile.split("/").pop() + ".map\n");
writeFileSync(absMap, JSON.stringify(result.map));
writeFileSync(absMetadata, JSON.stringify(result.metadata?.stylex ?? []));
