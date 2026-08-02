#!/usr/bin/env node
/**
 * Assert a PNG is fully opaque.
 *
 * This exists because of one specific iOS behaviour: an `apple-touch-icon`
 * with any transparency is composited onto black, so a designer rounding the
 * corners in the source SVG gets four black wedges on the home screen instead
 * of the rounded mask iOS applies itself. resvg always writes RGBA, so the
 * alpha channel is present whether or not it is used, and nothing else would
 * notice.
 *
 * Reads the PNG rather than resvg's in-memory pixmap so the check holds
 * whatever the renderer's API looks like.
 *
 * Used by rasterize.mjs, which refuses to emit a non-opaque icon.
 */

import { inflateSync } from "node:zlib";

const BYTES_PER_PIXEL = { 0: 1, 2: 3, 4: 2, 6: 4 };
const HAS_ALPHA = new Set([4, 6]);

/**
 * Accept either a Buffer or a plain Uint8Array. resvg hands back a
 * Uint8Array, which has none of Buffer's read helpers.
 */
const asBuffer = (bytes) =>
  Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Parse the chunks we care about: IHDR for the header, IDAT for the pixels. */
export function readPng(bytes) {
  const buf = asBuffer(bytes);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length; // length + type + data + crc
  }
  if (!header) throw new Error("PNG has no IHDR");
  return { ...header, pixels: Buffer.concat(idat) };
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reverse one scanline's filter, in place. */
function unfilter(type, line, previous, bpp) {
  if (type === 0) return;
  for (let i = 0; i < line.length; i++) {
    const left = i >= bpp ? line[i - bpp] : 0;
    const up = previous[i];
    const upLeft = i >= bpp ? previous[i - bpp] : 0;
    let addend;
    if (type === 1) addend = left;
    else if (type === 2) addend = up;
    else if (type === 3) addend = (left + up) >> 1;
    else if (type === 4) addend = paeth(left, up, upLeft);
    else throw new Error(`unknown PNG filter type ${type}`);
    line[i] = (line[i] + addend) & 0xff;
  }
}

/**
 * Lowest alpha value in the image, 0–255. Returns 255 for colour types that
 * carry no alpha channel at all, which are opaque by definition.
 */
export function minAlpha(bytes) {
  const png = readPng(bytes);
  const bpp = BYTES_PER_PIXEL[png.colourType];
  if (bpp === undefined) throw new Error(`unsupported colour type ${png.colourType}`);
  if (png.bitDepth !== 8) throw new Error(`expected 8-bit, got ${png.bitDepth}`);
  if (png.interlace !== 0) throw new Error("interlaced PNGs are not supported");
  if (!HAS_ALPHA.has(png.colourType)) return 255;

  const raw = inflateSync(png.pixels);
  const stride = png.width * bpp;
  let previous = Buffer.alloc(stride);
  let lowest = 255;
  let at = 0;
  for (let y = 0; y < png.height; y++) {
    const filter = raw[at++];
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    unfilter(filter, line, previous, bpp);
    // Alpha is the last byte of each pixel for both RGBA and grey+alpha.
    for (let i = bpp - 1; i < stride; i += bpp) {
      if (line[i] < lowest) lowest = line[i];
    }
    previous = line;
  }
  return lowest;
}
