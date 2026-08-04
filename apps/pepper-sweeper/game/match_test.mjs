import { test } from "node:test";
import assert from "node:assert/strict";

import { layout } from "./board.js";
import {
  DUEL_PEPPERS,
  PEPPERS_TO_WIN,
  SHAPES,
  finish,
  newMatch,
  other,
  passTurn,
  peppersFor,
  scored,
  seconds,
  tick,
  touch,
} from "./match.js";

const solo = newMatch("solo");
const duel = newMatch("duel");

test("newMatch: a fresh game is playing, with nothing found", () => {
  assert.equal(duel.phase, "play");
  assert.deepEqual(duel.found, { left: 0, right: 0 });
  assert.equal(duel.winner, null);
  assert.equal(duel.outcome, null);
  assert.equal(duel.touched, false);
});

test("newMatch: the near player opens", () => {
  assert.equal(duel.turn, "left");
  assert.equal(solo.turn, "left");
});

test("other: the two sides swap", () => {
  assert.equal(other("left"), "right");
  assert.equal(other("right"), "left");
});

// ---- the clock --------------------------------------------------------------

test("tick: frames pile up while the game is on", () => {
  assert.equal(tick(tick(solo, 1), 2).frames, 3);
});

test("tick: a finished game's clock has stopped", () => {
  const done = finish(solo, "swept");
  assert.equal(tick(done, 60).frames, done.frames);
});

test("seconds: sixty frames is one second, rounded down", () => {
  assert.equal(seconds(tick(solo, 59)), 0);
  assert.equal(seconds(tick(solo, 60)), 1);
  assert.equal(seconds(tick(solo, 119)), 1);
});

// ---- taking turns -----------------------------------------------------------

test("passTurn: the go moves across the table", () => {
  assert.equal(passTurn(duel).turn, "right");
  assert.equal(passTurn(passTurn(duel)).turn, "left");
});

test("passTurn: nobody's go moves once the match is over", () => {
  const over = scoreTimes(duel, "left", PEPPERS_TO_WIN);
  assert.equal(passTurn(over).turn, over.turn);
});

/** Find `n` peppers in a row for one side. */
function scoreTimes(match, side, n) {
  let out = match;
  for (let i = 0; i < n; i++) out = scored(out, side);
  return out;
}

test("scored: a pepper goes on that side's plate and the go stays put", () => {
  const out = scored(duel, "left");
  assert.deepEqual(out.found, { left: 1, right: 0 });
  assert.equal(out.turn, "left");
  assert.equal(out.phase, "play");
});

test("scored: the fifth pepper takes the match", () => {
  const out = scoreTimes(duel, "right", PEPPERS_TO_WIN);
  assert.equal(out.winner, "right");
  assert.equal(out.phase, "end");
});

test("scored: one short of five is still a game", () => {
  const out = scoreTimes(duel, "right", PEPPERS_TO_WIN - 1);
  assert.equal(out.winner, null);
  assert.equal(out.phase, "play");
});

test("scored: a finished match takes no more peppers", () => {
  const over = scoreTimes(duel, "left", PEPPERS_TO_WIN);
  assert.equal(scored(over, "right").found.right, 0);
});

test("a duel always resolves: two players cannot split the peppers level", () => {
  // The constants are the whole guarantee. One short of this and both sides
  // can reach PEPPERS_TO_WIN - 1 with nothing left on the board — a match
  // with no winner and no move that would produce one.
  assert.ok(DUEL_PEPPERS >= PEPPERS_TO_WIN * 2 - 1);
});

test("a duel is a race for the board, not away from it", () => {
  // Five of eleven is most of the way to all of them. The floor above admits
  // any larger count, and a much larger one would end the match while the
  // board was still mostly face down — so the upper bound is stated too.
  assert.ok(DUEL_PEPPERS <= PEPPERS_TO_WIN * 2 + 2);
});

// ---- solo -------------------------------------------------------------------

test("finish: a swept board and a bitten one both end the game", () => {
  assert.equal(finish(solo, "swept").phase, "end");
  assert.equal(finish(solo, "swept").outcome, "swept");
  assert.equal(finish(solo, "bitten").outcome, "bitten");
});

test("finish: the first ending is the one that sticks", () => {
  assert.equal(finish(finish(solo, "bitten"), "swept").outcome, "bitten");
});

test("touch: the first tap is remembered, so the peppers are only relaid once", () => {
  const first = touch(solo);
  assert.equal(first.touched, true);
  // Idempotent, and the same object: a second tap must not look like a first.
  assert.equal(touch(first), first);
});

// ---- how many peppers -------------------------------------------------------

test("peppersFor: a duel is always nine, whatever the screen", () => {
  assert.equal(peppersFor("duel", layout(400, 800, SHAPES.duel)), DUEL_PEPPERS);
  assert.equal(peppersFor("duel", layout(900, 500, SHAPES.duel)), DUEL_PEPPERS);
});

test("peppersFor: solo lays about one cell in six, with room left to open", () => {
  // Not a count but a density: `layout` cuts every screen into roughly the
  // same number of cells, so a bigger phone gets bigger cells, not more
  // peppers. What has to hold on every screen is the ratio.
  for (const [w, h] of [
    [400, 800],
    [1200, 900],
    [240, 380],
  ]) {
    const board = layout(w, h, SHAPES.solo);
    const cells = board.cols * board.rows;
    const peppers = peppersFor("solo", board);
    assert.ok(peppers > cells * 0.1 && peppers < cells * 0.25);
    // `relayAround` holds the first tap and its eight neighbours cold, so
    // there has to be somewhere else for every pepper to go.
    assert.ok(peppers + 9 <= cells);
  }
});

test("SHAPES: a duel board is square and a solo board fills the screen", () => {
  assert.equal(SHAPES.duel.square, true);
  assert.equal(SHAPES.solo.square, false);
});

test("SHAPES: a duel board keeps the peppers dense enough to deduce about", () => {
  // Sparse is worse than small: a scattering opens in huge floods and gives
  // a player nothing to read between turns.
  for (const [w, h] of [
    [400, 800],
    [390, 844],
    [360, 780],
  ]) {
    const cells = layout(w, h, SHAPES.duel);
    const density = DUEL_PEPPERS / (cells.cols * cells.rows);
    assert.ok(density > 0.12 && density < 0.25);
  }
});
