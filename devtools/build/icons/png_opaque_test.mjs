import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { minAlpha, readPng } from "./png_opaque.mjs";

/** Build a real PNG so the decoder is exercised, not stubbed. */
function png({ width, height, colourType, rows, filter = 0 }) {
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colourType;

  const raw = Buffer.concat(
    rows.map((row) => Buffer.concat([Buffer.from([filter]), Buffer.from(row)])),
  );
  assert.equal(rows[0].length, width * bpp, "test row width mismatch");

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    // CRC is never checked by the decoder, so a placeholder keeps this small.
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("readPng: reads the header", () => {
  const head = readPng(png({ width: 2, height: 1, colourType: 6, rows: [[0, 0, 0, 255, 0, 0, 0, 255]] }));
  assert.equal(head.width, 2);
  assert.equal(head.height, 1);
  assert.equal(head.bitDepth, 8);
  assert.equal(head.colourType, 6);
});

test("minAlpha: accepts a Uint8Array, which is what resvg returns", () => {
  const buf = png({ width: 1, height: 1, colourType: 6, rows: [[1, 2, 3, 255]] });
  // Not a Buffer: no readUInt32BE, no subarray-with-offset semantics.
  const bytes = new Uint8Array(buf);
  assert.equal(minAlpha(bytes), 255);
});

test("readPng: rejects something that is not a PNG", () => {
  assert.throws(() => readPng(Buffer.from("not an image at all")), /not a PNG/);
});

test("minAlpha: a fully opaque RGBA image reports 255", () => {
  const buf = png({
    width: 2,
    height: 2,
    colourType: 6,
    rows: [
      [1, 2, 3, 255, 4, 5, 6, 255],
      [7, 8, 9, 255, 10, 11, 12, 255],
    ],
  });
  assert.equal(minAlpha(buf), 255);
});

test("minAlpha: one transparent pixel is enough to fail", () => {
  const buf = png({
    width: 2,
    height: 2,
    colourType: 6,
    rows: [
      [1, 2, 3, 255, 4, 5, 6, 255],
      // A rounded corner looks exactly like this.
      [7, 8, 9, 255, 10, 11, 12, 0],
    ],
  });
  assert.equal(minAlpha(buf), 0);
});

test("minAlpha: partial transparency is caught too", () => {
  const buf = png({
    width: 1,
    height: 1,
    colourType: 6,
    rows: [[9, 9, 9, 128]],
  });
  assert.equal(minAlpha(buf), 128);
});

test("minAlpha: RGB without an alpha channel is opaque by definition", () => {
  const buf = png({ width: 2, height: 1, colourType: 2, rows: [[1, 2, 3, 4, 5, 6]] });
  assert.equal(minAlpha(buf), 255);
});

test("minAlpha: grey + alpha uses the last byte of each pixel", () => {
  const buf = png({ width: 2, height: 1, colourType: 4, rows: [[200, 255, 200, 40]] });
  assert.equal(minAlpha(buf), 40);
});

test("minAlpha: un-filters Sub-filtered scanlines", () => {
  // Filter 1 (Sub) stores each byte as a delta from the pixel to its left, so
  // a naive reader would see alpha 255 then 0 and wrongly pass this image.
  const buf = png({
    width: 2,
    height: 1,
    colourType: 6,
    filter: 1,
    rows: [[10, 10, 10, 255, 0, 0, 0, 0]],
  });
  assert.equal(minAlpha(buf), 255, "second pixel's alpha is 255 + 0 = 255");
});

test("minAlpha: un-filters Up-filtered scanlines", () => {
  // Filter 2 (Up) is a delta from the row above.
  const buf = png({
    width: 1,
    height: 2,
    colourType: 6,
    filter: 2,
    rows: [
      [0, 0, 0, 200],
      [0, 0, 0, 55],
    ],
  });
  assert.equal(minAlpha(buf), 200, "row two is 200 + 55 = 255");
});
