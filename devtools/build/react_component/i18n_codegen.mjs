#!/usr/bin/env node
/**
 * Emit a typed TS module exposing per-locale catalog URLs for an app, driven
 * by the asset-pipeline manifest that includes the merged i18n catalogs.
 *
 * Output shape:
 *   // generated — do not edit
 *   export const I18N_CATALOGS = {
 *     en: "/assets/app_i18n_en.abc123.json",
 *     es: "/assets/app_i18n_es.def456.json",
 *   } as const;
 *   export type Locale = keyof typeof I18N_CATALOGS;
 *
 * Usage:
 *   i18n_codegen.mjs --manifest <path> --locales en,es,fr,ru \
 *     --name-prefix app_i18n_ --url-prefix /assets/ --out <path>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

function parseArgs(argv) {
  const args = {
    manifest: null,
    locales: [],
    namePrefix: null,
    urlPrefix: "/assets/",
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--locales") args.locales = argv[++i].split(",").filter(Boolean);
    else if (a === "--name-prefix") args.namePrefix = argv[++i];
    else if (a === "--url-prefix") args.urlPrefix = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else throw new Error(`i18n_codegen: unknown arg: ${a}`);
  }
  if (!args.manifest) throw new Error("i18n_codegen: --manifest is required");
  if (args.locales.length === 0) throw new Error("i18n_codegen: --locales is required");
  if (args.namePrefix === null) throw new Error("i18n_codegen: --name-prefix is required");
  if (!args.out) throw new Error("i18n_codegen: --out is required");
  return args;
}

export function generate({ manifest, locales, namePrefix, urlPrefix }) {
  const normalizedPrefix = urlPrefix.endsWith("/") ? urlPrefix : urlPrefix + "/";
  const sortedLocales = [...locales].sort();

  const entries = sortedLocales.map((locale) => {
    const key = `${namePrefix}${locale}.json`;
    const hashed = manifest[key];
    if (hashed === undefined) {
      throw new Error(
        `i18n_codegen: locale "${locale}" missing from manifest (expected entry "${key}"). ` +
          `Available keys: ${Object.keys(manifest).sort().join(", ")}`,
      );
    }
    return [locale, normalizedPrefix + hashed];
  });

  const lines = [
    "// generated — do not edit",
    "",
    "export const I18N_CATALOGS = {",
    ...entries.map(([locale, url]) => `  ${locale}: ${JSON.stringify(url)},`),
    "} as const;",
    "",
    "export type Locale = keyof typeof I18N_CATALOGS;",
  ];
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(resolve(execroot, args.manifest), "utf-8"));
  const ts = generate({
    manifest,
    locales: args.locales,
    namePrefix: args.namePrefix,
    urlPrefix: args.urlPrefix,
  });
  writeFileSync(resolve(execroot, args.out), ts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
