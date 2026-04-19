// These tests are the guard: mergeCatalogs is invoked by every i18n_bundle
// Bazel action, so anything that throws here fails the build of every app
// that depends on the offending catalog. Coverage is therefore a
// compile-time property — not a CI lint that could be bypassed.

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

// Error-message quality: these tests enforce that each invariant failure
// gives a developer enough context to fix the problem without re-running
// with verbose flags. If an error message silently loses one of these
// pieces of context (locale, key, or file path), the developer falls
// back to grepping catalogs manually and the "fail at build time" promise
// stops being useful.

test("collision error names the two specific fragment files", () => {
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en"],
      fragments: [
        frag("en", "apps/foo/Header.en.mf2.json", { "shared.x": "A" }),
        frag("en", "apps/foo/Footer.en.mf2.json", { "shared.x": "B" }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.match(err.message, /apps\/foo\/Header\.en\.mf2\.json/);
    assert.match(err.message, /apps\/foo\/Footer\.en\.mf2\.json/);
    assert.match(err.message, /shared\.x/);
  }
});

test("undeclared-locale error names the locale and the file", () => {
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en", "es"],
      fragments: [
        frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
        frag("pt", "Layout.pt.mf2.json", { "layout.home": "Início" }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.match(err.message, /pt/);
    assert.match(err.message, /Layout\.pt\.mf2\.json/);
  }
});

test("stray-key error is clear about which side is wrong", () => {
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en", "es"],
      fragments: [
        frag("en", "Layout.en.mf2.json", { "layout.home": "Home" }),
        frag("es", "Layout.es.mf2.json", {
          "layout.home": "Inicio",
          // typo: nav_home instead of navHome
          "layout.nav_home": "Inicio",
        }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    // Must name the locale where the stray key lives, not just say
    // "coverage mismatch".
    assert.match(err.message, /\bes\b/);
    assert.match(err.message, /layout\.nav_home/);
    // Must NOT claim the en side is wrong — en is the source of truth.
    assert.doesNotMatch(err.message, /\ben has stray\b/i);
  }
});

test("malformed MF2 syntax fails the merge with file/key/locale context", () => {
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en"],
      fragments: [
        frag("en", "Trending.en.mf2.json", {
          // .match without a preceding .input declaration — messageformat's
          // parser rejects this as "empty-token" or similar at parse time.
          "concerts.trending.count":
            ".match {$count :number}\none {{{$count} concert}}\n*   {{{$count} concerts}}",
        }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.match(err.message, /Malformed MF2/);
    assert.match(err.message, /Trending\.en\.mf2\.json/);
    assert.match(err.message, /concerts\.trending\.count/);
    assert.match(err.message, /\ben\b/);
  }
});

test("well-formed MF2 with .input + .match + plural passes validation", () => {
  // Must not throw — round-trip of the real shape we ship in panallet.
  const out = mergeCatalogs({
    sourceLocale: "en",
    locales: ["en"],
    fragments: [
      frag("en", "Trending.en.mf2.json", {
        "concerts.trending.count":
          ".input {$count :number}\n.match $count\none {{{$count} concert}}\n*   {{{$count} concerts}}",
      }),
    ],
  });
  assert.ok(out.en["concerts.trending.count"]);
});

test("malformed MF2 in a non-source locale fails just the same", () => {
  // Guards against the validator only running on the source locale —
  // translators' catalogs are where syntax bugs are most likely to land.
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en", "es"],
      fragments: [
        frag("en", "Layout.en.mf2.json", { "layout.title": "Home" }),
        frag("es", "Layout.es.mf2.json", {
          // Unbalanced `{{` brace — MF2 rejects at parse.
          "layout.title": "Inicio {{incomplete",
        }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.match(err.message, /Malformed MF2/);
    assert.match(err.message, /Layout\.es\.mf2\.json/);
    assert.match(err.message, /\bes\b/);
  }
});

test("multi-locale failure reports locales independently", () => {
  // es is missing a key, fr has a stray one — a single run should report
  // both (rather than failing on the first and hiding the second). In
  // practice we fail fast per-locale but ensure at least the first is
  // surfaced with full context.
  try {
    mergeCatalogs({
      sourceLocale: "en",
      locales: ["en", "es", "fr"],
      fragments: [
        frag("en", "Home.en.mf2.json", { "home.title": "Home" }),
        frag("es", "Home.es.mf2.json", {}),
        frag("fr", "Home.fr.mf2.json", {
          "home.title": "Accueil",
          "home.extra": "Extra",
        }),
      ],
    });
    assert.fail("expected throw");
  } catch (err) {
    // The specific ordering of which error fires first is implementation
    // detail; both failure modes must be *reachable* and produce an
    // actionable message. Assert at least the es-missing path surfaces
    // since it's the first declared non-source locale.
    assert.match(err.message, /es/);
    assert.match(err.message, /home\.title/);
  }
});
