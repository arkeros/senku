import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_SWIPE, seatAt, swipeDir } from "./swipe.js";

const far = MIN_SWIPE * 2;

test("swipeDir: a flick shorter than MIN_SWIPE is a tap, not a turn", () => {
  assert.equal(swipeDir(0, -(MIN_SWIPE - 1), "bottom"), null);
  assert.equal(swipeDir(0, 0, "bottom"), null);
});

test("swipeDir: the longer axis decides the heading", () => {
  assert.equal(swipeDir(far, -4, "bottom"), "right");
  assert.equal(swipeDir(4, -far, "bottom"), "up");
});

test("swipeDir: the near player reads the screen the usual way round", () => {
  assert.equal(swipeDir(0, -far, "bottom"), "up");
  assert.equal(swipeDir(0, far, "bottom"), "down");
  assert.equal(swipeDir(-far, 0, "bottom"), "left");
  assert.equal(swipeDir(far, 0, "bottom"), "right");
});

test("swipeDir: the far player's flicks are read from their side of the table", () => {
  // They sit at the top edge, so a flick away from their body travels down
  // the glass — and their snake, drawn heading down the screen, goes forward.
  assert.equal(swipeDir(0, far, "top"), "up");
  assert.equal(swipeDir(0, -far, "top"), "down");
  assert.equal(swipeDir(far, 0, "top"), "left");
  assert.equal(swipeDir(-far, 0, "top"), "right");
});

test("swipeDir: a perfect diagonal resolves the same way every time", () => {
  assert.equal(swipeDir(far, far, "bottom"), swipeDir(far, far, "bottom"));
  assert.ok(swipeDir(far, far, "bottom") !== null);
});

test("swipeDir: the threshold can be raised for a bigger screen", () => {
  assert.equal(swipeDir(0, -far, "bottom", far * 2), null);
  assert.equal(swipeDir(0, -far, "bottom", far), "up");
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
