#!/usr/bin/env node
/**
 * Fail if an emitted document would not fit in one round trip.
 *
 * A document is the only thing on the render path a client cannot discover
 * early — everything else is named *by* it. So the moment a document stops
 * fitting in the initial congestion window, its tail arrives a round trip
 * after its head, and every URL in that tail is discovered a round trip late
 * with it. The prerendered markup sits between `<head>` and the module
 * script, so that is exactly the seam that grows: see
 * docs/adr/0013-build-time-prerender.md.
 *
 * The regression has no symptom. The page still works, every other test
 * still passes, and the only way to notice is to read a waterfall.
 *
 * Measured in Brotli, because Brotli is what the edge serves — see the
 * compression section of //infra/cloud/gcp/lb:README.md. The quality below
 * is not a guess: Cloud CDN does not document a level ("Cloud CDN determines
 * the compression level to balance total download size and CPU cost"), so it
 * was measured against the live edge.
 *
 * Usage: document_budget.mjs <max-bytes> <file>...
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

/**
 * The Brotli quality that most nearly reproduces Cloud CDN's own output,
 * rounded towards over-estimating.
 *
 * Compressing a real 29,698-byte document and comparing against the bytes
 * the edge actually returned for it (6,270):
 *
 *     q=4  6,622   +352
 *     q=5  6,299    +29   <- chosen
 *     q=6  6,262     -8
 *     q=11 5,731   -539
 *
 * The edge falls between 5 and 6, which is the usual band for compression
 * done per-response rather than ahead of time. Five is taken rather than six
 * because this is a budget: over-estimating by 0.5% costs a little headroom,
 * while under-estimating would let a document through here that does not fit
 * on the wire, which is the one outcome the check exists to prevent.
 */
const BROTLI_QUALITY = 5;

export function compressedSize(bytes) {
  return brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  }).length;
}

/**
 * The entries that do not fit, in the order given.
 *
 * `size === maxBytes` fits: the budget is the window, and a document exactly
 * filling it still arrives in one round trip.
 */
export function overBudget(entries, maxBytes) {
  return entries.filter((e) => e.size > maxBytes);
}

export function report(entries, maxBytes) {
  const lines = entries.map((e) =>
    e.size > maxBytes
      ? `FAIL: ${e.path} is ${e.size} bytes brotli, over the ${maxBytes}-byte budget`
      : `ok:   ${e.path} — ${e.size} / ${maxBytes} bytes brotli`,
  );
  const failed = overBudget(entries, maxBytes);
  if (failed.length) {
    lines.push(
      "",
      "A document past this budget costs a round trip on every cold visit.",
      "Shrink what goes into it — the prerendered markup is usually the part",
      "that grew — or move {{SCRIPTS}} into <head> so the entry is still",
      "discovered in the first segment. Raising the number is not a fix: it",
      "is the size of the initial congestion window, not a policy.",
    );
  }
  return { ok: failed.length === 0, lines };
}

// Bazel passes workspace-relative paths; a js_test runs from a runfiles tree
// whose root differs by rules_js version and by whether the test is run
// directly or through `bazel test`. Try the candidates rather than encode one.
function locate(p) {
  const roots = [
    process.cwd(),
    process.env.JS_BINARY__RUNFILES,
    process.env.RUNFILES_DIR,
    process.env.JS_BINARY__EXECROOT,
  ].filter(Boolean);

  for (const root of roots) {
    for (const candidate of [resolve(root, p), resolve(root, "_main", p)]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`document_budget: cannot find ${p} (looked under ${roots.join(", ")})`);
}

function main(argv) {
  const maxBytes = Number(argv[0]);
  const files = argv.slice(1);
  if (!Number.isFinite(maxBytes) || files.length === 0) {
    throw new Error("Usage: document_budget.mjs <max-bytes> <file>...");
  }

  const entries = files.map((p) => ({
    path: p,
    size: compressedSize(readFileSync(locate(p))),
  }));

  const { ok, lines } = report(entries, maxBytes);
  console.log(lines.join("\n"));
  if (!ok) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("document_budget.mjs")) {
  main(process.argv.slice(2));
}
