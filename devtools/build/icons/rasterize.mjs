#!/usr/bin/env node
/**
 * Rasterize one SVG to one PNG at a fixed square size.
 *
 * Uses resvg's WebAssembly build rather than its native one on purpose: the
 * native package ships eight platform-specific binaries as optional deps, so
 * the output would depend on which machine ran the build. The wasm artifact is
 * a single file that behaves identically on a developer's mac and a Linux CI
 * runner.
 *
 * Text is deliberately unsupported. resvg lays out `<text>` against a font
 * database, and a hermetic build has no business reading the host's fonts — so
 * `loadSystemFonts` is off and an SVG containing a `<text>` element is
 * rejected with a pointed error rather than silently rasterized without
 * glyphs. Draw letterforms as paths.
 *
 * CLI:
 *   rasterize.mjs --svg <in.svg> --out <out.png> --size <px>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { minAlpha } from "./png_opaque.mjs";

/** `<text>` as an element, not `<textPath>` and not the word in prose. */
const TEXT_ELEMENT = /<text[\s/>]/;
const COMMENT = /<!--[\s\S]*?-->/g;

export function assertNoText(svg, file) {
  // Comments are stripped first. Scanning raw source would flag an SVG whose
  // comment merely *mentions* `<text>` — including the note in our own icons
  // explaining why there isn't any, which is exactly how this was found.
  if (TEXT_ELEMENT.test(svg.replace(COMMENT, ""))) {
    throw new Error(
      `${file}: <text> is not supported — rasterizing it would depend on the ` +
        `build machine's fonts. Convert the lettering to paths.`,
    );
  }
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  if (!args.svg || !args.out || !args.size) {
    throw new Error("usage: rasterize.mjs --svg <in> --out <out> --size <px>");
  }
  const size = Number(args.size);
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`--size must be a positive integer, got ${args.size}`);
  }
  return { svg: args.svg, out: args.out, size };
}

// Matches the guard the other codegen binaries in this tree use, so the test
// can import `parseArgs` / `assertNoText` without running anything.
if (import.meta.url === `file://${process.argv[1]}`) {
  const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
  const { svg: svgPath, out, size } = parseArgs(process.argv.slice(2));
  const svg = readFileSync(resolve(execroot, svgPath), "utf8");
  assertNoText(svg, svgPath);

  const require = createRequire(import.meta.url);
  const { initWasm, Resvg } = require("@resvg/resvg-wasm");
  await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));

  const resvg = new Resvg(svg, {
    // Square by construction: `fitTo` width plus a square viewBox in the
    // source keeps every emitted size an exact multiple of the art.
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();

  // Checked here rather than in a separate test so it cannot be skipped: iOS
  // composites a transparent apple-touch-icon onto black, turning rounded
  // corners in the source SVG into black wedges on the home screen. resvg
  // always writes an alpha channel, so nothing else would notice.
  const lowest = minAlpha(png);
  if (lowest !== 255) {
    throw new Error(
      `${svgPath}: rendered at ${size}px it is not fully opaque (lowest alpha ` +
        `${lowest}). Keep the artwork full-bleed and let iOS mask the corners.`,
    );
  }

  writeFileSync(resolve(execroot, out), png);
}
