/**
 * Collects StyleX metadata JSON files and generates a CSS stylesheet.
 *
 * Reads .stylex.json files (each an array of [hash, {ltr, rtl?}, priority] tuples)
 * produced by stylex_transpile.mjs and merges them into a single CSS file.
 *
 * Usage: node stylex_collect_css.mjs --output styles.css [--use-layers] meta1.json meta2.json
 */
import stylexPlugin from "@stylexjs/babel-plugin";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let outputPath = null;
let useLayers = false;
const metadataFiles = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output") {
    outputPath = args[++i];
  } else if (args[i] === "--use-layers") {
    useLayers = true;
  } else {
    metadataFiles.push(args[i]);
  }
}

if (!outputPath || metadataFiles.length === 0) {
  console.error(
    "Usage: stylex_collect_css.mjs --output <file.css> [--use-layers] <meta.json...>"
  );
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const allRules = [];

for (const file of metadataFiles) {
  let rules;
  try {
    rules = JSON.parse(readFileSync(resolve(execroot, file), "utf-8"));
  } catch (err) {
    console.error(`Failed to parse StyleX metadata from ${file}: ${err.message}`);
    process.exit(1);
  }
  allRules.push(...rules);
}

let css;
try {
  css = stylexPlugin.processStylexRules(allRules, useLayers);
} catch (err) {
  console.error(`Failed to process StyleX rules into CSS: ${err.message}`);
  process.exit(1);
}
const resolvedOutput = resolve(execroot, outputPath);
mkdirSync(dirname(resolvedOutput), { recursive: true });
writeFileSync(resolvedOutput, css);
