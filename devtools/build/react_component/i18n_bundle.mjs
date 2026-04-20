#!/usr/bin/env node
/**
 * Per-app i18n orchestrator: runs the merge + codegen pipeline in a single
 * Bazel action so downstream rules can declare every output (merged JSONs
 * and the TS manifest) without chaining multiple actions.
 *
 * Delegates to the pure functions exported by i18n_merge.mjs and
 * i18n_codegen.mjs so the invariant-enforcement and TS-emission logic stays
 * independently unit-testable.
 *
 * CLI:
 *   i18n_bundle.mjs \
 *     --merge-manifest <path-to-merge-manifest.json> \
 *     --out-dir <dir-for-merged-jsons> \
 *     --out-prefix <prefix-for-merged-jsons> \
 *     --manifest-ts <path-to-generated-ts>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { mergeCatalogs } from "./i18n_merge.mjs";
import { generate } from "./i18n_codegen.mjs";

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

function parseArgs(argv) {
  const args = {
    mergeManifest: null,
    outDir: null,
    outPrefix: "",
    manifestTs: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--merge-manifest") args.mergeManifest = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--out-prefix") args.outPrefix = argv[++i];
    else if (a === "--manifest-ts") args.manifestTs = argv[++i];
    else throw new Error(`i18n_bundle: unknown arg: ${a}`);
  }
  if (!args.mergeManifest) throw new Error("i18n_bundle: --merge-manifest is required");
  if (!args.outDir) throw new Error("i18n_bundle: --out-dir is required");
  if (!args.manifestTs) throw new Error("i18n_bundle: --manifest-ts is required");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(
  readFileSync(resolve(execroot, args.mergeManifest), "utf-8"),
);

const fragments = manifest.fragments.map((f) => ({
  locale: f.locale,
  path: f.path,
  data: JSON.parse(readFileSync(resolve(execroot, f.path), "utf-8")),
}));

// Per-component ref manifests are produced by i18n_extract_refs for every
// react_component with i18n catalogs. Flattening here lets the merger
// treat "referenced ids" as a single aggregate set without knowing which
// component it came from — though the file context travels with each ref
// so error messages can still point at the offending source line.
const references = (manifest.refs_files ?? []).flatMap((p) => {
  const parsed = JSON.parse(readFileSync(resolve(execroot, p), "utf-8"));
  return parsed.refs ?? [];
});

const merged = mergeCatalogs({
  sourceLocale: manifest.source_locale,
  locales: manifest.locales,
  fragments,
  references,
});

// Per-locale JSONs: kept as declared outputs so a developer can inspect what
// each deployed locale actually ships, and so future tooling (URL-serving,
// diff against source, etc.) can consume them without re-running the merge.
for (const [locale, catalog] of Object.entries(merged)) {
  const out = resolve(execroot, args.outDir, `${args.outPrefix}${locale}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(catalog, null, 2) + "\n");
}

// TS manifest: the main bundle artifact — the generated main.tsx wrapper
// from react_app_codegen.mjs imports I18N_CATALOGS from here and passes the
// active locale's object straight to <I18nProvider>.
writeFileSync(
  resolve(execroot, args.manifestTs),
  generate({ catalogs: merged }),
);
