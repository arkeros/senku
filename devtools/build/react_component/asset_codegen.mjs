#!/usr/bin/env node
/**
 * Emit a TypeScript module with typed URL consts for a content-hashed asset
 * set, driven by a manifest produced by //devtools/build/tools/hash_and_copy.
 *
 * Usage: asset_codegen.mjs --manifest <path> --out <path> [--url-prefix <s>]
 *
 * Input manifest shape: { "<original-basename>": "<hashed-basename>", ... }
 * Output shape:
 *   // generated — do not edit
 *   export const logoUrl: string = "/assets/logo.a7f92c31d08e.svg";
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as R from "ramda";

// rules_js' js_binary wrapper cds into bazel-bin but exposes the execroot
// via this env var — paths from Bazel args are relative to execroot, so
// we resolve against it. See stylex_collect_css.mjs for the same pattern.
const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

function parseArgs(argv) {
  const args = { manifest: null, out: null, urlPrefix: "/assets/" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--url-prefix") args.urlPrefix = argv[++i];
    else throw new Error(`asset_codegen: unknown arg: ${a}`);
  }
  if (!args.manifest) throw new Error("asset_codegen: --manifest is required");
  if (!args.out) throw new Error("asset_codegen: --out is required");
  return args;
}

/**
 * Derive a TypeScript identifier from an asset's original basename.
 * Rules:
 *   1. Drop the extension
 *   2. Split the stem on non-alphanumeric runs
 *   3. Lowercase the first segment; PascalCase-join the rest (camelCase)
 *   4. Prefix `_` if the result starts with a digit
 *   5. Fail if nothing remains
 *   6. Append `Url` so the export name says what it is
 */
export function deriveIdentifier(basename) {
  const dotIdx = basename.lastIndexOf(".");
  const stem = dotIdx > 0 ? basename.slice(0, dotIdx) : basename;
  const segments = stem.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(
      `asset_codegen: filename produces an empty identifier after sanitization: "${basename}"`,
    );
  }
  const first = segments[0].toLowerCase();
  const rest = segments
    .slice(1)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
  let ident = first + rest.join("");
  if (/^\d/.test(ident)) ident = "_" + ident;
  return ident + "Url";
}

const enrichEntry = ([original, hashed]) => ({
  original,
  hashed,
  ident: deriveIdentifier(original),
});

// Returns the first ident with more than one originating filename, or
// undefined if every ident is unique. Groups preserve insertion order, so the
// returned originals are in the same order as the sorted input.
const findCollision = R.pipe(
  R.groupBy(R.prop("ident")),
  R.toPairs,
  R.find(([, items]) => items.length > 1),
);

const emitLine = (normalizedPrefix) => ({ ident, hashed }) =>
  `export const ${ident}: string = ${JSON.stringify(normalizedPrefix + hashed)};`;

export function generate(manifest, urlPrefix) {
  const normalizedPrefix = urlPrefix.endsWith("/") ? urlPrefix : urlPrefix + "/";
  const enriched = R.pipe(
    R.toPairs,
    R.sortBy(R.head),
    R.map(enrichEntry),
  )(manifest);

  const collision = findCollision(enriched);
  if (collision) {
    const [ident, items] = collision;
    throw new Error(
      `asset_codegen: identifier collision — "${items[0].original}" and "${items[1].original}" both produce "${ident}". ` +
        "Rename one or give the files distinct stems.",
    );
  }

  const lines = [
    "// generated — do not edit",
    "",
    ...R.map(emitLine(normalizedPrefix), enriched),
  ];
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(resolve(execroot, args.manifest), "utf-8"));
  const ts = generate(manifest, args.urlPrefix);
  writeFileSync(resolve(execroot, args.out), ts);
}

// Only run when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
