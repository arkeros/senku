import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeCatalogs } from "./i18n_merge.mjs";

const frag = (locale, path, data) => ({ locale, path, data });

test("merges single component across locales", () => {
  const out = mergeCatalogs({
    sourceLocale: "en",
    locales: ["en", "es"],
    fragments: [
      frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
      frag("es", "Layout.es.mf2.json", { "layout.home": "Inicio" }),
    ],
  });
  assert.deepEqual(out, {
    en: { "layout.home": "Home" },
    es: { "layout.home": "Inicio" },
  });
});

test("unions keys across multiple components", () => {
  const out = mergeCatalogs({
    sourceLocale: "en",
    locales: ["en"],
    fragments: [
      frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
      frag("en", "Home.en.mf2.json", { "home.title": "Welcome" }),
    ],
  });
  assert.deepEqual(out.en, {
    "layout.home": "Home",
    "home.title": "Welcome",
  });
});

test("collision within a locale throws with both paths", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en"],
        fragments: [
          frag("en", "Layout.en.mf2.json", { "shared.title": "A" }),
          frag("en", "Home.en.mf2.json", { "shared.title": "B" }),
        ],
      }),
    (err) =>
      /collision/i.test(err.message) &&
      err.message.includes("shared.title") &&
      err.message.includes("Layout.en.mf2.json") &&
      err.message.includes("Home.en.mf2.json"),
  );
});

test("missing translation in non-source locale throws with locale + key list", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en", "es"],
        fragments: [
          frag("en", "Layout.en.mf2.json", {
            "layout.home": "Home",
            "layout.about": "About",
          }),
          frag("es", "Layout.es.mf2.json", { "layout.home": "Inicio" }),
        ],
      }),
    (err) =>
      /missing/i.test(err.message) &&
      err.message.includes("es") &&
      err.message.includes("layout.about"),
  );
});

test("stray key in non-source locale throws with locale + key list", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en", "es"],
        fragments: [
          frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
          frag("es", "Layout.es.mf2.json", {
            "layout.home": "Inicio",
            "layout.ghost": "Fantasma",
          }),
        ],
      }),
    (err) =>
      /stray|unknown|unexpected/i.test(err.message) &&
      err.message.includes("es") &&
      err.message.includes("layout.ghost"),
  );
});

test("source-locale-only (single-locale build) succeeds", () => {
  const out = mergeCatalogs({
    sourceLocale: "en",
    locales: ["en"],
    fragments: [frag("en", "Layout.en.mf2.json", { "layout.home": "Home" })],
  });
  assert.deepEqual(out, { en: { "layout.home": "Home" } });
});

test("no fragments at all produces empty catalogs for every declared locale", () => {
  const out = mergeCatalogs({
    sourceLocale: "en",
    locales: ["en", "es", "fr"],
    fragments: [],
  });
  assert.deepEqual(out, { en: {}, es: {}, fr: {} });
});

test("declared locale with no fragments but source has keys fails", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en", "ru"],
        fragments: [
          frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
        ],
      }),
    (err) =>
      /missing/i.test(err.message) &&
      err.message.includes("ru") &&
      err.message.includes("layout.home"),
  );
});

test("fragment with locale not in declared locales fails", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en", "es"],
        fragments: [
          frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
          frag("zh", "Layout.zh.mf2.json", { "layout.home": "首页" }),
        ],
      }),
    (err) => /undeclared|unexpected/i.test(err.message) && /zh/.test(err.message),
  );
});

test("multiple missing keys are all reported, sorted", () => {
  assert.throws(
    () =>
      mergeCatalogs({
        sourceLocale: "en",
        locales: ["en", "es"],
        fragments: [
          frag("en", "Layout.en.mf2.json", {
            "layout.home": "Home",
            "layout.about": "About",
            "layout.concerts": "Concerts",
          }),
          frag("es", "Layout.es.mf2.json", { "layout.home": "Inicio" }),
        ],
      }),
    (err) => {
      const msg = err.message;
      return (
        msg.includes("layout.about") &&
        msg.includes("layout.concerts") &&
        // deterministic order: sorted alphabetically for stable error output
        msg.indexOf("layout.about") < msg.indexOf("layout.concerts")
      );
    },
  );
});
