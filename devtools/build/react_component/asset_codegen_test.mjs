import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveIdentifier, generate } from "./asset_codegen.mjs";

test("deriveIdentifier: camelCase on hyphen", () => {
  assert.equal(deriveIdentifier("icon-large.png"), "iconLargeUrl");
});

test("deriveIdentifier: camelCase on underscore", () => {
  assert.equal(deriveIdentifier("site_logo.svg"), "siteLogoUrl");
});

test("deriveIdentifier: Inter.woff2 lowercases first segment", () => {
  assert.equal(deriveIdentifier("Inter.woff2"), "interUrl");
});

test("deriveIdentifier: leading digit gets _ prefix", () => {
  assert.equal(deriveIdentifier("2024-banner.png"), "_2024BannerUrl");
});

test("deriveIdentifier: spaces split into segments", () => {
  assert.equal(deriveIdentifier("my photo.jpg"), "myPhotoUrl");
});

test("deriveIdentifier: no extension still works", () => {
  assert.equal(deriveIdentifier("Makefile"), "makefileUrl");
});

test("deriveIdentifier: multi-dot filename only strips last extension", () => {
  assert.equal(deriveIdentifier("hero-image.v2.png"), "heroImageV2Url");
});

test("deriveIdentifier: empty after sanitization fails", () => {
  assert.throws(() => deriveIdentifier("_.svg"), /empty identifier/);
  assert.throws(() => deriveIdentifier("---.svg"), /empty identifier/);
});

test("deriveIdentifier: distinct stems produce distinct identifiers", () => {
  // Regression guard for the collision path — ensures different extensions
  // on the same stem DO collide (feature, not bug).
  assert.equal(deriveIdentifier("logo.svg"), deriveIdentifier("logo.png"));
});

test("generate: urlPrefix missing trailing slash is normalized", () => {
  const out = generate({ "logo.svg": "logo.abc123.svg" }, "/assets");
  assert.match(out, /"\/assets\/logo\.abc123\.svg"/);
});

test("generate: urlPrefix with trailing slash is preserved", () => {
  const out = generate({ "logo.svg": "logo.abc123.svg" }, "/assets/");
  assert.match(out, /"\/assets\/logo\.abc123\.svg"/);
});
