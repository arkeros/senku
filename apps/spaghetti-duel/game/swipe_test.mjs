import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_SWIPE, seatAt, swipeDir } from "./swipe.js";

const far = MIN_SWIPE * 2;

test("swipeDir: a flick shorter than MIN_SWIPE is a tap, not a turn", () => {
  assert.equal(swipeDir(0, -(MIN_SWIPE - 1)), null);
  assert.equal(swipeDir(0, 0), null);
});

test("swipeDir: the longer axis decides the heading", () => {
  assert.equal(swipeDir(far, -4), "right");
  assert.equal(swipeDir(4, -far), "up");
});

test("swipeDir: the strand goes the way the finger went across the glass", () => {
  assert.equal(swipeDir(0, -far), "up");
  assert.equal(swipeDir(0, far), "down");
  assert.equal(swipeDir(-far, 0), "left");
  assert.equal(swipeDir(far, 0), "right");
});

test("swipeDir: a perfect diagonal resolves the same way every time", () => {
  assert.equal(swipeDir(far, far), swipeDir(far, far));
  assert.ok(swipeDir(far, far) !== null);
});

test("swipeDir: the threshold can be raised for a bigger screen", () => {
  assert.equal(swipeDir(0, -far, far * 2), null);
  assert.equal(swipeDir(0, -far, far), "up");
});

test("seatAt: solo hands every touch to the only player", () => {
  assert.equal(seatAt(10, 800, "solo"), "bottom");
  assert.equal(seatAt(790, 800, "solo"), "bottom");
});

test("seatAt: a duel splits the glass down the middle", () => {
  assert.equal(seatAt(10, 800, "duel"), "top");
  assert.equal(seatAt(399, 800, "duel"), "top");
  assert.equal(seatAt(401, 800, "duel"), "bottom");
  assert.equal(seatAt(790, 800, "duel"), "bottom");
});
