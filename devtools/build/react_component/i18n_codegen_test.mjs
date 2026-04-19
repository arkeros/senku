import { test } from "node:test";
import assert from "node:assert/strict";

import { generate } from "./i18n_codegen.mjs";

test("emits I18N_CATALOGS object with inlined locale entries", () => {
  const out = generate({
    catalogs: {
      en: { "layout.home": "Home" },
      es: { "layout.home": "Inicio" },
    },
  });
  assert.match(out, /export const I18N_CATALOGS/);
  assert.match(out, /en:\s*\{[\s\S]*"layout\.home":\s*"Home"/);
  assert.match(out, /es:\s*\{[\s\S]*"layout\.home":\s*"Inicio"/);
});

test("emits Locale type alias as keyof I18N_CATALOGS", () => {
  const out = generate({
    catalogs: { en: {}, es: {} },
  });
  assert.match(out, /export type Locale\s*=\s*keyof typeof I18N_CATALOGS/);
});

test("output is deterministic (locales sorted)", () => {
  const a = generate({
    catalogs: { ru: { k: "r" }, en: { k: "e" }, fr: { k: "f" }, es: { k: "s" } },
  });
  const b = generate({
    catalogs: { en: { k: "e" }, es: { k: "s" }, fr: { k: "f" }, ru: { k: "r" } },
  });
  assert.equal(a, b);
  // locales appear alphabetically in the output
  assert.ok(a.indexOf("en:") < a.indexOf("es:"));
  assert.ok(a.indexOf("es:") < a.indexOf("fr:"));
  assert.ok(a.indexOf("fr:") < a.indexOf("ru:"));
});

test("output is deterministic (keys within a catalog sorted)", () => {
  const out = generate({
    catalogs: {
      en: { "z.last": "Z", "a.first": "A", "m.middle": "M" },
    },
  });
  assert.ok(out.indexOf('"a.first"') < out.indexOf('"m.middle"'));
  assert.ok(out.indexOf('"m.middle"') < out.indexOf('"z.last"'));
});

test("escapes special characters in string values", () => {
  const out = generate({
    catalogs: {
      en: {
        quotes: 'She said "hi"',
        newline: "line1\nline2",
        backslash: "a\\b",
      },
    },
  });
  // JSON.stringify handles all of these — assertion is the round-trip is safe.
  assert.match(out, /"quotes":\s*"She said \\"hi\\""/);
  assert.match(out, /"newline":\s*"line1\\nline2"/);
  assert.match(out, /"backslash":\s*"a\\\\b"/);
});

test("empty catalogs produce an empty object entry per locale", () => {
  const out = generate({
    catalogs: { en: {}, es: {} },
  });
  assert.match(out, /en:\s*\{\s*\}/);
  assert.match(out, /es:\s*\{\s*\}/);
});

test("preserves MF2 .match syntax verbatim", () => {
  const mf2 = ".input {$count :number}\n.match $count\none {{One}}\n* {{Many}}";
  const out = generate({
    catalogs: { en: { count: mf2 } },
  });
  // Value should be JSON-encoded as a string (newlines escaped).
  assert.match(out, /"count":\s*"\.input \{\$count :number\}\\n/);
});
