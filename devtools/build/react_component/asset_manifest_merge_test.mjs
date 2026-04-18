import { test } from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "./asset_manifest_merge.mjs";

test("parseArgs: urlPrefix missing trailing slash is normalized", () => {
  const args = parseArgs([
    "--out-dir", "out",
    "--manifest", "m.json",
    "--url-prefix", "/assets",
  ]);
  assert.equal(args.urlPrefix, "/assets/");
});

test("parseArgs: urlPrefix with trailing slash is preserved", () => {
  const args = parseArgs([
    "--out-dir", "out",
    "--manifest", "m.json",
    "--url-prefix", "/assets/",
  ]);
  assert.equal(args.urlPrefix, "/assets/");
});

test("parseArgs: default urlPrefix already ends with /", () => {
  const args = parseArgs(["--out-dir", "out", "--manifest", "m.json"]);
  assert.equal(args.urlPrefix, "/assets/");
});
