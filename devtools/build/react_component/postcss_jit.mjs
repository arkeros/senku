/**
 * Runs PostCSS with postcss-jit-props to tree-shake unused Open Props
 * custom properties from the combined CSS.
 *
 * Usage: node postcss_jit.mjs --input <file.css> --output <file.css>
 */
import postcss from "postcss";
import postcssJitProps from "postcss-jit-props";
import OpenProps from "open-props";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
let input, output;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--input") input = args[++i];
  else if (args[i] === "--output") output = args[++i];
}

if (!input || !output) {
  console.error("Usage: postcss_jit.mjs --input <file.css> --output <file.css>");
  process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
const css = readFileSync(resolve(execroot, input), "utf-8");

const result = await postcss([postcssJitProps(OpenProps)]).process(css, { from: undefined });

const absOutput = resolve(execroot, output);
mkdirSync(dirname(absOutput), { recursive: true });
writeFileSync(absOutput, result.css);
