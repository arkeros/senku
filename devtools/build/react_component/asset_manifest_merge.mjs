#!/usr/bin/env node
/**
 * Merge per-leaf hash_and_copy manifests into an app-level devserver manifest,
 * and copy every hashed file into a single flat output directory.
 *
 * Each leaf (react_component with `assets`, asset_library) produces:
 *   - a manifest JSON: { "<basename>": "<hashed-basename>", ... }
 *   - a tree directory containing the hashed files
 *
 * This tool flattens them across an app: one manifest keyed by URL path,
 * and one directory with all hashed files. Mirrors how browser_dep_group
 * lands a sibling directory next to its manifest so the devserver can
 * serve from one place.
 *
 * Usage:
 *   asset_manifest_merge \
 *     --out-dir <flat-dir> \
 *     --manifest <devserver-manifest.json> \
 *     [--url-prefix /assets/] \
 *     --pair <leaf-manifest> <tree-dir>  [--pair ...]
 *
 * Output manifest shape (consumed by devserver.mjs):
 *   {
 *     "type": "assets",
 *     "urls": { "/assets/logo.a7f92c31d08e.svg": "logo.a7f92c31d08e.svg", ... }
 *   }
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

function parseArgs(argv) {
  const out = { outDir: null, manifest: null, urlPrefix: "/assets/", pairs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") out.outDir = argv[++i];
    else if (a === "--manifest") out.manifest = argv[++i];
    else if (a === "--url-prefix") out.urlPrefix = argv[++i];
    else if (a === "--pair") {
      out.pairs.push({ manifest: argv[++i], treeDir: argv[++i] });
    } else {
      throw new Error(`asset_manifest_merge: unknown arg: ${a}`);
    }
  }
  if (!out.outDir) throw new Error("asset_manifest_merge: --out-dir is required");
  if (!out.manifest) throw new Error("asset_manifest_merge: --manifest is required");
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const absOutDir = resolve(execroot, args.outDir);
  mkdirSync(absOutDir, { recursive: true });

  const urls = {};
  // Track hashed names we've already copied so we don't attempt redundant
  // writes when two leaves share a hashed file (identical-content case).
  const seen = new Set();

  for (const { manifest: mfPath, treeDir } of args.pairs) {
    const mf = JSON.parse(readFileSync(resolve(execroot, mfPath), "utf-8"));
    for (const [, hashed] of Object.entries(mf)) {
      const urlPath = args.urlPrefix + hashed;
      urls[urlPath] = hashed;
      if (!seen.has(hashed)) {
        copyFileSync(resolve(execroot, treeDir, hashed), join(absOutDir, hashed));
        seen.add(hashed);
      }
    }
  }

  const out = { type: "assets", urls };
  writeFileSync(resolve(execroot, args.manifest), JSON.stringify(out, null, 2) + "\n");
}

main();
