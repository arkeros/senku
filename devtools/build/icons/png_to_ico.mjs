#!/usr/bin/env node
/**
 * Wrap a PNG in an ICO container.
 *
 * Not for browsers: every browser we care about honours `<link rel="icon">`
 * with the SVG or PNG, and none of them probe `/favicon.ico` when those are
 * declared. It exists because the apps are SPAs served with
 * `try_files … /index.html`, so a request for `/favicon.ico` would otherwise
 * answer `200 text/html` with the whole page — and crawlers, feed readers and
 * link unfurlers do hardcode that path. A real icon there is more useful than
 * an HTML page pretending to be one.
 *
 * ICO has allowed a PNG payload since Vista, so this is a 22-byte header in
 * front of bytes we already generated rather than a second rasterization.
 *
 * CLI:
 *   png_to_ico.mjs --png <in.png> --out <out.ico>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { readPng } from "./png_opaque.mjs";

const ICONDIR = 6;
const ICONDIRENTRY = 16;

export function pngToIco(pngBytes) {
  const png = readPng(pngBytes);
  if (png.width > 256 || png.height > 256) {
    throw new Error(`ICO tops out at 256px, got ${png.width}x${png.height}`);
  }

  const header = Buffer.alloc(ICONDIR + ICONDIRENTRY);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon (2 would be a cursor)
  header.writeUInt16LE(1, 4); // one image in this file

  // 256 is stored as 0, which is why the format caps there.
  header.writeUInt8(png.width % 256, 6);
  header.writeUInt8(png.height % 256, 7);
  header.writeUInt8(0, 8); // palette size; 0 for truecolour
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(pngBytes.length, 14);
  header.writeUInt32LE(ICONDIR + ICONDIRENTRY, 18); // payload offset

  return Buffer.concat([header, Buffer.from(pngBytes)]);
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!args.png || !args.out) throw new Error("usage: png_to_ico.mjs --png <in> --out <out>");
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();
  const { png, out } = parseArgs(process.argv.slice(2));
  writeFileSync(resolve(execroot, out), pngToIco(readFileSync(resolve(execroot, png))));
}
