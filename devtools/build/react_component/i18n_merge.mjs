/**
 * Merges per-component i18n catalog fragments into one catalog per locale and
 * enforces three invariants as build errors:
 *
 *   1. No key is declared by two components within the same locale.
 *   2. Every key in the source-locale catalog exists in every non-source
 *      locale's catalog.
 *   3. No non-source-locale catalog declares a key absent from the source.
 *
 * The goal is that a green build guarantees every user-visible string has a
 * translation in every declared locale; catalog drift cannot ship.
 *
 * CLI usage:
 *   node i18n_merge.mjs \
 *     --manifest <path-to-manifest.json> \
 *     --out-dir <dir> \
 *     [--out-prefix <prefix>]
 *
 * Manifest schema:
 *   {
 *     "source_locale": "en",
 *     "locales": ["en", "es", ...],
 *     "fragments": [
 *       { "locale": "en", "path": "examples/stylex/Layout.en.mf2.json" },
 *       ...
 *     ]
 *   }
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { MessageFormat } from "messageformat";

export function mergeCatalogs({ sourceLocale, locales, fragments, references = [] }) {
  if (!locales.includes(sourceLocale)) {
    throw new Error(
      `source_locale "${sourceLocale}" must be in locales (${locales.join(", ")})`,
    );
  }

  // Group fragments by locale while checking for undeclared locales and
  // within-locale collisions in one pass.
  /** @type {Record<string, {key: string, value: string, path: string}[]>} */
  const perLocale = Object.fromEntries(locales.map((l) => [l, []]));
  for (const { locale, path, data } of fragments) {
    if (!(locale in perLocale)) {
      throw new Error(
        `Fragment ${path} declares undeclared locale "${locale}" (declared: ${locales.join(", ")})`,
      );
    }
    for (const [key, value] of Object.entries(data)) {
      // Parse each message against its target locale. A syntactically
      // broken MF2 string (unbalanced braces, .match without .input,
      // unknown function, etc.) otherwise ships into the bundle and only
      // explodes at runtime — here it becomes a build failure instead.
      // bidiIsolation is mirrored from the runtime so validation and
      // execution agree on option semantics.
      try {
        new MessageFormat(locale, value, { bidiIsolation: "none" });
      } catch (err) {
        throw new Error(
          `Malformed MF2 in ${path}, key "${key}", locale "${locale}": ${err?.message ?? err}`,
        );
      }
      perLocale[locale].push({ key, value, path });
    }
  }

  // Detect collision: two entries for the same (locale, key) with different
  // source paths.
  /** @type {Record<string, Record<string, string>>} */
  const merged = {};
  for (const locale of locales) {
    /** @type {Record<string, string>} */
    const catalog = {};
    /** @type {Record<string, string>} */
    const keyToPath = {};
    for (const { key, value, path } of perLocale[locale]) {
      if (key in catalog && keyToPath[key] !== path) {
        throw new Error(
          `i18n key collision: "${key}" declared in both ${keyToPath[key]} and ${path} for locale "${locale}"`,
        );
      }
      catalog[key] = value;
      keyToPath[key] = path;
    }
    merged[locale] = catalog;
  }

  // Enforce coverage against the source locale.
  const sourceKeys = new Set(Object.keys(merged[sourceLocale]));
  for (const locale of locales) {
    if (locale === sourceLocale) continue;
    const localeKeys = new Set(Object.keys(merged[locale]));

    const missing = [...sourceKeys].filter((k) => !localeKeys.has(k)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Locale "${locale}" is missing translations for ${missing.length} key(s): ${missing.join(", ")}`,
      );
    }

    const stray = [...localeKeys].filter((k) => !sourceKeys.has(k)).sort();
    if (stray.length > 0) {
      throw new Error(
        `Locale "${locale}" has stray key(s) not in source locale "${sourceLocale}": ${stray.join(", ")}`,
      );
    }
  }

  // Every id that a component referenced via <Trans id="..." /> or
  // format("...") must resolve to a catalog key. Group unresolved refs by
  // file so the error message reads like a real diagnostic ("Foo.tsx: key
  // X, key Y") rather than a flat list of pairs.
  const unresolved = references.filter((r) => !sourceKeys.has(r.key));
  if (unresolved.length > 0) {
    const byFile = {};
    for (const { file, key } of unresolved) {
      (byFile[file] ??= new Set()).add(key);
    }
    const lines = Object.keys(byFile)
      .sort()
      .map((f) => `  ${f}: ${[...byFile[f]].sort().join(", ")}`);
    throw new Error(
      `i18n reference check failed — ${unresolved.length} id(s) used in source but missing from the "${sourceLocale}" catalog:\n${lines.join("\n")}`,
    );
  }

  return merged;
}

function parseArgs(argv) {
  const args = { manifest: null, outDir: null, outPrefix: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--manifest") args.manifest = argv[++i];
    else if (argv[i] === "--out-dir") args.outDir = argv[++i];
    else if (argv[i] === "--out-prefix") args.outPrefix = argv[++i];
    else throw new Error(`Unknown arg: ${argv[i]}`);
  }
  if (!args.manifest || !args.outDir) {
    throw new Error(
      "Usage: i18n_merge.mjs --manifest <path> --out-dir <dir> [--out-prefix <prefix>]",
    );
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
  const args = parseArgs(process.argv.slice(2));

  const manifest = JSON.parse(
    readFileSync(resolve(execroot, args.manifest), "utf-8"),
  );
  const fragments = manifest.fragments.map((f) => ({
    locale: f.locale,
    path: f.path,
    data: JSON.parse(readFileSync(resolve(execroot, f.path), "utf-8")),
  }));

  const merged = mergeCatalogs({
    sourceLocale: manifest.source_locale,
    locales: manifest.locales,
    fragments,
  });

  for (const [locale, catalog] of Object.entries(merged)) {
    const out = resolve(execroot, args.outDir, `${args.outPrefix}${locale}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(catalog, null, 2) + "\n");
  }
}
