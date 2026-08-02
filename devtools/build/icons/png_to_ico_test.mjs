import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { parseArgs, pngToIco } from "./png_to_ico.mjs";

/** A minimal but structurally real PNG of the given size. */
function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const row = Buffer.alloc(width * 4, 255);
  const raw = Buffer.concat(
    Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), row])),
  );
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("pngToIco: writes a single-image icon directory", () => {
  const source = png(32, 32);
  const ico = pngToIco(source);

  assert.equal(ico.readUInt16LE(0), 0, "reserved");
  assert.equal(ico.readUInt16LE(2), 1, "type 1 = icon");
  assert.equal(ico.readUInt16LE(4), 1, "one image");
  assert.equal(ico.readUInt8(6), 32, "width");
  assert.equal(ico.readUInt8(7), 32, "height");
  assert.equal(ico.readUInt16LE(12), 32, "bits per pixel");
  assert.equal(ico.readUInt32LE(14), source.length, "payload length");
  assert.equal(ico.readUInt32LE(18), 22, "payload starts after the 22-byte header");
});

test("pngToIco: the payload is the PNG, byte for byte", () => {
  const source = png(16, 16);
  const ico = pngToIco(source);
  assert.equal(ico.length, 22 + source.length);
  assert.deepEqual(ico.subarray(22), source);
});

test("pngToIco: 256px is encoded as zero, per the format", () => {
  const ico = pngToIco(png(256, 256));
  assert.equal(ico.readUInt8(6), 0);
  assert.equal(ico.readUInt8(7), 0);
});

test("pngToIco: refuses anything larger than the format allows", () => {
  assert.throws(() => pngToIco(png(512, 512)), /tops out at 256px/);
});

test("parseArgs: both flags are required", () => {
  assert.deepEqual(parseArgs(["--png", "a.png", "--out", "b.ico"]), {
    png: "a.png",
    out: "b.ico",
  });
  assert.throws(() => parseArgs(["--png", "a.png"]), /usage/);
});
