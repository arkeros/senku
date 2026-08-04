import { test } from "node:test";
import assert from "node:assert/strict";

import { layout } from "./board.js";
import {
  CELLS_ACROSS,
  DUEL_PEPPERS,
  PEPPERS_TO_WIN,
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
  // The floor above admits any larger count, so the ceiling has to be stated
  // separately: the target must stay a large fraction of what is out there,
  // or the match ends while most of the griddle is still face down.
  assert.ok(PEPPERS_TO_WIN / DUEL_PEPPERS >= 0.4);
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

test("peppersFor: a duel lays the same count whatever the screen", () => {
  assert.equal(peppersFor("duel", layout(400, 800, CELLS_ACROSS.duel)), DUEL_PEPPERS);
  assert.equal(peppersFor("duel", layout(900, 500, CELLS_ACROSS.duel)), DUEL_PEPPERS);
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
    const board = layout(w, h, CELLS_ACROSS.solo);
    const cells = board.cols * board.rows;
    const peppers = peppersFor("solo", board);
    assert.ok(peppers > cells * 0.1 && peppers < cells * 0.25);
    // `relayAround` holds the first tap and its eight neighbours cold, so
    // there has to be somewhere else for every pepper to go.
    assert.ok(peppers + 9 <= cells);
  }
});

test("CELLS_ACROSS: a duel is cut coarser than a solo board, not smaller", () => {
  // The coarser cut is the whole mechanism: fewer cells keeps twelve peppers
  // dense and five of them nearly half, and bigger cells are the side effect
  // — which is the right way round for the mode two people play at speed.
  assert.ok(CELLS_ACROSS.duel < CELLS_ACROSS.solo);
  const duel = layout(390, 844, CELLS_ACROSS.duel);
  const solo = layout(390, 844, CELLS_ACROSS.solo);
  assert.ok(duel.cell > solo.cell);
  assert.ok(duel.cols * duel.rows < solo.cols * solo.rows);
});

test("CELLS_ACROSS: a duel board keeps the peppers dense enough to deduce about", () => {
  // Sparse is worse than small: a scattering opens in huge floods and gives
  // a player nothing to read between turns. The short phone is the tight end
  // — fewer rows fit, so the same twelve peppers crowd together.
  for (const [w, h] of [
    [400, 800],
    [390, 844],
    [430, 932],
    [375, 667],
    [360, 780],
  ]) {
    const board = layout(w, h, CELLS_ACROSS.duel);
    const density = DUEL_PEPPERS / (board.cols * board.rows);
    assert.ok(density > 0.12 && density < 0.25, `${w}x${h} density ${density}`);
  }
});
