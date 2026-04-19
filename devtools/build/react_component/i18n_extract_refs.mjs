#!/usr/bin/env node
/**
 * Scan a set of .ts/.tsx source files for i18n id references and emit a
 * JSON index. Drives the "referenced but undefined" build-time check in
 * i18n_merge.mjs — every id that appears in a component's source must
 * resolve to a key in the source-locale merged catalog, otherwise the
 * build fails before the app ever runs.
 *
 * Recognised call sites:
 *
 *   <Trans id="foo" />                 — required: literal id (see below)
 *   <Trans id='foo' values={{ ... }} />
 *   <Trans values={...} id={"foo"} />  — literal in JSX expr also OK
 *   format("foo")                      — literal extracted, non-literal ignored
 *   format("foo", { values })
 *   useI18n().format("foo")
 *
 * Enforcement: every `<Trans>` tag must declare `id` as a string literal.
 * A dynamic `<Trans id={key}>` makes the whole reference set impossible to
 * analyze statically, so the extractor rejects it. This is what lets
 * i18n_merge guarantee "every <Trans> id resolves to a catalog key at
 * compile time" — the guarantee evaporates if we silently skipped dynamic
 * cases. `format()` is softer: its first argument also has to be a
 * literal to be extracted, but we can't *enforce* literals on it because
 * the same syntax matches `Intl.NumberFormat.prototype.format(n)` which
 * legitimately takes a non-string.
 *
 * CLI:
 *   i18n_extract_refs.mjs --out <path> --src <a.tsx> [--src <b.tsx> ...]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Any opening `<Trans ...>` span (self-closing or not). First capture is
// the attribute text between `<Trans` and the closing `>` / `/>`.
const TRANS_TAG = /<Trans\b([^>]*?)\/?\s*>/g;

// Inside a Trans tag's attributes: id="foo", id='foo', id={"foo"}, id={'foo'}.
const LITERAL_ID = /\bid=\{?\s*["']([^"']+)["']\s*\}?/;

// `id=` present but not followed by a literal — flags a dynamic expression
// (`id={key}`, `id={prefix + ".x"}`, etc.) that we refuse to accept.
const ANY_ID_ATTR = /\bid=/;

// `.format("key", ...)` / `format("key")` / `useI18n().format("key")`.
// Only matches when the first argument is a string literal; otherwise the
// call is silently skipped (see file-header note).
const FORMAT_PATTERN = /\bformat\s*\(\s*["']([^"']+)["']/g;

export function extractRefs({ source, file }) {
  const refs = [];

  for (const m of source.matchAll(TRANS_TAG)) {
    const attrs = m[1] || "";
    const literal = attrs.match(LITERAL_ID);
    if (literal) {
      refs.push({ file, key: literal[1] });
      continue;
    }
    // A <Trans> with no literal id: either it has no id at all or id is a
    // dynamic expression. Both are build errors — the source must be
    // statically analyzable for coverage enforcement to mean anything.
    const snippet = m[0].trim();
    if (ANY_ID_ATTR.test(attrs)) {
      throw new Error(
        `${file}: <Trans> id must be a string literal (found dynamic expression). ${snippet}`,
      );
    }
    throw new Error(
      `${file}: <Trans> requires an id="..." prop. ${snippet}`,
    );
  }

  for (const m of source.matchAll(FORMAT_PATTERN)) {
    refs.push({ file, key: m[1] });
  }

  return refs;
}

function parseArgs(argv) {
  const args = { out: null, srcs: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--src") args.srcs.push(argv[++i]);
    else throw new Error(`i18n_extract_refs: unknown arg: ${argv[i]}`);
  }
  if (!args.out) throw new Error("i18n_extract_refs: --out is required");
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
  const args = parseArgs(process.argv.slice(2));

  const allRefs = [];
  for (const src of args.srcs) {
    const source = readFileSync(resolve(execroot, src), "utf-8");
    allRefs.push(...extractRefs({ source, file: src }));
  }

  writeFileSync(
    resolve(execroot, args.out),
    JSON.stringify({ refs: allRefs }, null, 2) + "\n",
  );
}
