import { test } from "node:test";
import assert from "node:assert/strict";

import { generate } from "./i18n_codegen.mjs";

const MANIFEST = {
  "app_i18n_en.json": "app_i18n_en.abc123.json",
  "app_i18n_es.json": "app_i18n_es.def456.json",
  "app_i18n_fr.json": "app_i18n_fr.ghi789.json",
  "app_i18n_ru.json": "app_i18n_ru.jkl012.json",
};

test("emits I18N_CATALOGS with hashed URLs per locale", () => {
  const out = generate({
    manifest: MANIFEST,
    locales: ["en", "es", "fr", "ru"],
    namePrefix: "app_i18n_",
    urlPrefix: "/assets/",
  });
  assert.match(out, /export const I18N_CATALOGS/);
  assert.match(out, /en:\s*"\/assets\/app_i18n_en\.abc123\.json"/);
  assert.match(out, /es:\s*"\/assets\/app_i18n_es\.def456\.json"/);
  assert.match(out, /fr:\s*"\/assets\/app_i18n_fr\.ghi789\.json"/);
  assert.match(out, /ru:\s*"\/assets\/app_i18n_ru\.jkl012\.json"/);
});

test("emits Locale type alias as keyof I18N_CATALOGS", () => {
  const out = generate({
    manifest: MANIFEST,
    locales: ["en", "es", "fr", "ru"],
    namePrefix: "app_i18n_",
    urlPrefix: "/assets/",
  });
  assert.match(out, /export type Locale\s*=\s*keyof typeof I18N_CATALOGS/);
});

test("marks the object as const for literal URL types", () => {
  const out = generate({
    manifest: MANIFEST,
    locales: ["en"],
    namePrefix: "app_i18n_",
    urlPrefix: "/assets/",
  });
  assert.match(out, /\}\s*as const/);
});

test("url prefix missing trailing slash is normalized", () => {
  const out = generate({
    manifest: MANIFEST,
    locales: ["en"],
    namePrefix: "app_i18n_",
    urlPrefix: "/static",
  });
  assert.match(out, /"\/static\/app_i18n_en\.abc123\.json"/);
});

test("locale missing from manifest throws with clear context", () => {
  assert.throws(
    () =>
      generate({
        manifest: { "app_i18n_en.json": "app_i18n_en.abc.json" },
        locales: ["en", "es"],
        namePrefix: "app_i18n_",
        urlPrefix: "/assets/",
      }),
    (err) =>
      /missing|not found/i.test(err.message) &&
      err.message.includes("es") &&
      err.message.includes("app_i18n_es.json"),
  );
});

test("output is deterministic (sorted by locale)", () => {
  const a = generate({
    manifest: MANIFEST,
    locales: ["ru", "en", "fr", "es"],
    namePrefix: "app_i18n_",
    urlPrefix: "/assets/",
  });
  const b = generate({
    manifest: MANIFEST,
    locales: ["en", "es", "fr", "ru"],
    namePrefix: "app_i18n_",
    urlPrefix: "/assets/",
  });
  assert.equal(a, b);
});

test("respects name prefix when picking entries", () => {
  const out = generate({
    manifest: {
      "my-prefix_en.json": "my-prefix_en.hash.json",
      "my-prefix_es.json": "my-prefix_es.hash.json",
      "unrelated.png": "unrelated.deadbeef.png",
    },
    locales: ["en", "es"],
    namePrefix: "my-prefix_",
    urlPrefix: "/assets/",
  });
  assert.match(out, /en:\s*"\/assets\/my-prefix_en\.hash\.json"/);
  assert.match(out, /es:\s*"\/assets\/my-prefix_es\.hash\.json"/);
  assert.doesNotMatch(out, /unrelated/);
});
