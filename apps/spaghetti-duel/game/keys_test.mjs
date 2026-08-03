import { test } from "node:test";
import assert from "node:assert/strict";

import { keyAction } from "./keys.js";

test("keyAction: the arrows steer the near player", () => {
  assert.deepEqual(keyAction("ArrowUp"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("ArrowDown"), { kind: "steer", seat: "bottom", dir: "down" });
  assert.deepEqual(keyAction("ArrowLeft"), { kind: "steer", seat: "bottom", dir: "left" });
  assert.deepEqual(keyAction("ArrowRight"), { kind: "steer", seat: "bottom", dir: "right" });
});

test("keyAction: wasd and ijkl give a duel two hands on one keyboard", () => {
  assert.deepEqual(keyAction("w"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("s"), { kind: "steer", seat: "bottom", dir: "down" });
  assert.deepEqual(keyAction("a"), { kind: "steer", seat: "bottom", dir: "left" });
  assert.deepEqual(keyAction("d"), { kind: "steer", seat: "bottom", dir: "right" });
  assert.deepEqual(keyAction("i"), { kind: "steer", seat: "top", dir: "up" });
  assert.deepEqual(keyAction("k"), { kind: "steer", seat: "top", dir: "down" });
  assert.deepEqual(keyAction("j"), { kind: "steer", seat: "top", dir: "left" });
  assert.deepEqual(keyAction("l"), { kind: "steer", seat: "top", dir: "right" });
});

test("keyAction: a held shift or caps lock still steers", () => {
  assert.deepEqual(keyAction("W"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("L"), { kind: "steer", seat: "top", dir: "right" });
});

test("keyAction: both modes can be started without a pointer", () => {
  assert.deepEqual(keyAction("1"), { kind: "start", mode: "solo" });
  assert.deepEqual(keyAction("2"), { kind: "start", mode: "duel" });
});

test("keyAction: enter and space start the one-player game", () => {
  assert.deepEqual(keyAction("Enter"), { kind: "start", mode: "solo" });
  assert.deepEqual(keyAction(" "), { kind: "start", mode: "solo" });
});

test("keyAction: every mode the plate offers has a key", () => {
  const started = ["1", "2", "Enter", " "].map((k) => keyAction(k).mode);
  for (const mode of ["solo", "duel"]) assert.ok(started.includes(mode), `no key starts ${mode}`);
});

test("keyAction: anything else is not ours to swallow", () => {
  for (const key of ["Tab", "Escape", "q", "F5", "3"]) assert.equal(keyAction(key), null);
});
