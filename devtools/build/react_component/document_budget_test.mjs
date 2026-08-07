import { test } from "node:test";
import assert from "node:assert/strict";
import { brotliCompressSync, constants } from "node:zlib";

import { compressedSize, overBudget, report } from "./document_budget.mjs";

// The budget is the congestion window, so a document that exactly fills it
// still arrives in one round trip. Off-by-one here is the realistic bug:
// it is the difference between a check that fires on the real boundary and
// one that fires a byte early forever.
test("a document exactly at the budget fits", () => {
  assert.deepEqual(overBudget([{ path: "a", size: 14600 }], 14600), []);
});

test("a document one byte over does not", () => {
  assert.deepEqual(overBudget([{ path: "a", size: 14601 }], 14600), [
    { path: "a", size: 14601 },
  ]);
});

test("overBudget names every offender, not just the first", () => {
  const got = overBudget(
    [
      { path: "small", size: 10 },
      { path: "big-1", size: 99999 },
      { path: "big-2", size: 88888 },
    ],
    14600,
  );
  assert.deepEqual(got.map((e) => e.path), ["big-1", "big-2"]);
});

test("report is ok when everything fits, and says so per document", () => {
  const { ok, lines } = report([{ path: "index.html", size: 8000 }], 14600);
  assert.equal(ok, true);
  assert.match(lines[0], /^ok:\s+index\.html/);
});

// A failure has to say which document and by how much — the fix is always
// "shrink this one thing", and a bare non-zero exit does not say which.
test("report names the failing document and both numbers", () => {
  const { ok, lines } = report([{ path: "index.html", size: 20000 }], 14600);
  assert.equal(ok, false);
  assert.match(lines[0], /index\.html/);
  assert.match(lines[0], /20000/);
  assert.match(lines[0], /14600/);
});

// Guards the quality constant against a well-meaning bump to 11. Maximum
// quality is the intuitive choice and the wrong one: it under-reports
// against what Cloud CDN actually serves, turning the budget into one that
// passes documents which do not fit on the wire. Measured against a real
// document, q=11 came out 539 bytes under the edge's own output where q=5
// came out 29 over.
test("compressedSize measures at the edge's quality, not the maximum", () => {
  // Varied markup. A repeated string is the tempting fixture and a useless
  // one: brotli crushes `"<div>x</div>".repeat(n)` to ~40 bytes at every
  // quality, so the levels do not separate and the assertion passes on a
  // coin flip. Real documents have entropy — differing class names, scores,
  // player numbers — so the fixture has to as well.
  const body = Buffer.from(
    Array.from(
      { length: 2000 },
      (_, i) => `<div class="x${i % 97}kd2ho x${i % 53}b7nbos">jugador ${i} · ${(i * 7919) % 1000}</div>`,
    ).join(""),
  );

  const maximal = brotliCompressSync(body, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

  assert.ok(
    compressedSize(body) > maximal,
    `expected an edge-like quality to be looser than q=11 (${maximal} bytes); ` +
      `got ${compressedSize(body)} — check BROTLI_QUALITY`,
  );
});
