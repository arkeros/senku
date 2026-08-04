import { test } from "node:test";
import assert from "node:assert/strict";

import { HOLD_MS, MOVE_SLOP, holdVerdict, isTap, startKey } from "./input.js";

test("holdVerdict: a finger that has only just landed is still undecided", () => {
  assert.equal(holdVerdict(0, 0), "waiting");
  assert.equal(holdVerdict(HOLD_MS - 1, 0), "waiting");
});

test("holdVerdict: held long enough, it plants a flag", () => {
  assert.equal(holdVerdict(HOLD_MS, 0), "flag");
  assert.equal(holdVerdict(HOLD_MS * 3, MOVE_SLOP), "flag");
});

test("holdVerdict: a finger that wandered off the cell is a scroll, not a flag", () => {
  assert.equal(holdVerdict(HOLD_MS * 3, MOVE_SLOP + 1), "cancelled");
  assert.equal(holdVerdict(0, MOVE_SLOP + 1), "cancelled");
});

test("isTap: a quick, still press counts", () => {
  assert.equal(isTap(HOLD_MS - 1, 0), true);
  assert.equal(isTap(HOLD_MS - 1, MOVE_SLOP), true);
});

test("isTap: a long press has already done its job, and a drag never was one", () => {
  // The flag fires under the finger, so lifting afterwards must not also
  // reveal the cell it was planted on.
  assert.equal(isTap(HOLD_MS, 0), false);
  assert.equal(isTap(10, MOVE_SLOP + 1), false);
});

test("startKey: 1 and 2 read as the player counts the two modes are", () => {
  assert.equal(startKey("1"), "solo");
  assert.equal(startKey("2"), "duel");
});

test("startKey: enter and space mean the game you can play alone", () => {
  assert.equal(startKey("Enter"), "solo");
  assert.equal(startKey(" "), "solo");
});

test("startKey: every other key belongs to whoever pressed it", () => {
  assert.equal(startKey("Tab"), null);
  assert.equal(startKey("3"), null);
  assert.equal(startKey("q"), null);
});
