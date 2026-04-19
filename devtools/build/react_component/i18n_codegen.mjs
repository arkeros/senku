#!/usr/bin/env node
/**
 * Emit a TypeScript module with per-locale catalogs inlined as object
 * literals. Used by react_app to produce {app}_i18n_manifest.ts that the
 * Layout imports and hands to <I18nProvider>.
 *
 * Output shape:
 *   // generated — do not edit
 *   export const I18N_CATALOGS = {
 *     en: { "layout.home": "Home" },
 *     es: { "layout.home": "Inicio" },
 *   };
 *   export type Locale = keyof typeof I18N_CATALOGS;
 *
 * Inlining keeps all catalogs in the main bundle so locale selection is
 * synchronous — no fetch, no loading state. For panellet's 4-locale scope
 * this adds only a few KB; larger apps can add fetch-based loading later
 * without changing the runtime surface.
 *
 * CLI:
 *   i18n_codegen.mjs --catalog en=<json-path> [--catalog es=<json-path> ...] \
 *     --out <ts-path>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

function parseArgs(argv) {
  const args = { catalogs: [], out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--catalog") {
      const spec = argv[++i];
      const eq = spec.indexOf("=");
      if (eq < 0) {
        throw new Error(
          `i18n_codegen: --catalog expects <locale>=<path>, got "${spec}"`,
        );
      }
      args.catalogs.push({
        locale: spec.slice(0, eq),
        path: spec.slice(eq + 1),
      });
    } else if (a === "--out") {
      args.out = argv[++i];
    } else {
      throw new Error(`i18n_codegen: unknown arg: ${a}`);
    }
  }
  if (!args.out) throw new Error("i18n_codegen: --out is required");
  if (args.catalogs.length === 0) {
    throw new Error("i18n_codegen: at least one --catalog is required");
  }
  return args;
}

export function generate({ catalogs }) {
  const sortedLocales = Object.keys(catalogs).sort();

  const lines = ["// generated — do not edit", "", "export const I18N_CATALOGS = {"];
  for (const locale of sortedLocales) {
    const cat = catalogs[locale];
    const keys = Object.keys(cat).sort();
    if (keys.length === 0) {
      lines.push(`  ${locale}: {},`);
    } else {
      lines.push(`  ${locale}: {`);
      for (const k of keys) {
        lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(cat[k])},`);
      }
      lines.push("  },");
    }
  }
  lines.push("};");
  lines.push("");
  lines.push("export type Locale = keyof typeof I18N_CATALOGS;");
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalogs = {};
  for (const { locale, path } of args.catalogs) {
    catalogs[locale] = JSON.parse(readFileSync(resolve(execroot, path), "utf-8"));
  }
  writeFileSync(resolve(execroot, args.out), generate({ catalogs }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
