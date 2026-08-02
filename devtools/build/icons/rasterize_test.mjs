import { test } from "node:test";
import assert from "node:assert/strict";

import { assertNoText, parseArgs } from "./rasterize.mjs";

test("parseArgs: reads the three flags", () => {
  assert.deepEqual(
    parseArgs(["--svg", "a.svg", "--out", "b.png", "--size", "180"]),
    { svg: "a.svg", out: "b.png", size: 180 },
  );
});

test("parseArgs: every flag is required", () => {
  assert.throws(() => parseArgs(["--svg", "a.svg", "--out", "b.png"]), /usage/);
  assert.throws(() => parseArgs(["--out", "b.png", "--size", "16"]), /usage/);
});

test("parseArgs: size must be a positive integer", () => {
  for (const bad of ["0", "-8", "12.5", "big"]) {
    assert.throws(
      () => parseArgs(["--svg", "a", "--out", "b", "--size", bad]),
      /positive integer/,
      `accepted --size ${bad}`,
    );
  }
});

test("assertNoText: rejects <text>, because it would need host fonts", () => {
  for (const svg of [
    `<svg><text x="0" y="0">7</text></svg>`,
    `<svg><text\n  x="0">7</text></svg>`,
    `<svg><text/></svg>`,
  ]) {
    assert.throws(() => assertNoText(svg, "icon.svg"), /not supported/, svg);
  }
});

test("assertNoText: allows paths", () => {
  assert.doesNotThrow(() => assertNoText(`<svg><path d="M0 0H8"/></svg>`, "i.svg"));
});

test("assertNoText: a comment mentioning <text> is not markup", () => {
  // The icons carry a note explaining why they use paths instead, and scanning
  // raw source flagged them for saying so.
  assert.doesNotThrow(() =>
    assertNoText(
      `<svg><!-- digits are paths, not <text>, so no fonts are needed --><path/></svg>`,
      "icon.svg",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoText(`<svg><!--\n  multi-line\n  <text x="0"/>\n--><rect/></svg>`, "icon.svg"),
  );
});

test("assertNoText: still catches real markup after a comment", () => {
  assert.throws(
    () => assertNoText(`<svg><!-- fine --><text x="0">7</text></svg>`, "icon.svg"),
    /not supported/,
  );
});

test("assertNoText: <title> is metadata, not rendered lettering", () => {
  // resvg ignores <title>; it is there for accessibility tooling.
  assert.doesNotThrow(() => assertNoText(`<svg><title>Icon</title><rect/></svg>`, "i.svg"));
});
