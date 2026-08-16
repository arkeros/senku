import { test } from "node:test";
import assert from "node:assert/strict";

import { layout } from "./board.js";
import {
  CUT,
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

/** Phones, tablets and a desktop window — the range a web game actually meets. */
const SCREENS = [
  [375, 667],
  [390, 844],
  [393, 852],
  [440, 956],
  [744, 1133],
  [1024, 1366],
  [1440, 900],
];

test("peppersFor: a duel lays the same count whatever the screen", () => {
  for (const [w, h] of SCREENS) {
    assert.equal(peppersFor("duel", layout(w, h, CUT.duel)), DUEL_PEPPERS);
  }
});

test("a duel is the same board on every screen, not just the same count", () => {
  // This is what makes DUEL_PEPPERS and PEPPERS_TO_WIN mean anything: they
  // are absolute numbers, and twelve peppers is a fair minefield on
  // seventy-two cells and a coin toss on thirty. Holding the columns alone
  // would not do it — the rows would still follow the screen's shape, and a
  // tablet would be playing a third-hot board.
  const [first, ...rest] = SCREENS.map(([w, h]) => layout(w, h, CUT.duel));
  for (const board of rest) {
    assert.equal(board.cols, first.cols);
    assert.equal(board.rows, first.rows);
  }
  const density = DUEL_PEPPERS / (first.cols * first.rows);
  assert.ok(density > 0.14 && density < 0.2, `density ${density}`);
});

test("a duel board reaches the edge of whatever it is drawn on", () => {
  // A fixed board cannot fill both axes of every screen, but it must always
  // reach one of them — otherwise it is a postage stamp in the middle.
  for (const [w, h] of SCREENS) {
    const b = layout(w, h, CUT.duel);
    const spareW = w - b.pad * 2 - b.cols * b.cell;
    const spareH = h - (b.pad + b.band) * 2 - b.rows * b.cell;
    assert.ok(Math.min(spareW, spareH) < b.cell, `${w}x${h} leaves a whole cell spare`);
  }
});

test("peppersFor: solo lays about one cell in six, with room left to open", () => {
  for (const [w, h] of [...SCREENS, [240, 380]]) {
    const board = layout(w, h, CUT.solo);
    const cells = board.cols * board.rows;
    const peppers = peppersFor("solo", board);
    assert.ok(peppers > cells * 0.1 && peppers < cells * 0.25);
    // `relayAround` holds the first tap and its eight neighbours cold, so
    // there has to be somewhere else for every pepper to go.
    assert.ok(peppers + 9 <= cells);
  }
});

test("solo grows with the screen; a duel keeps its shape and grows its cells", () => {
  // The two halves of the same decision. A solo board is a puzzle the size of
  // whatever it is on, so a tablet is more board at the same thumb size; a
  // duel is a fixed board, so a tablet is the same board drawn larger.
  const phone = [390, 844];
  const tablet = [1024, 1366];
  const soloPhone = layout(...phone, CUT.solo);
  const soloTablet = layout(...tablet, CUT.solo);
  assert.ok(soloTablet.cols * soloTablet.rows > soloPhone.cols * soloPhone.rows * 2);
  assert.ok(Math.abs(soloTablet.cell - soloPhone.cell) <= 4);

  const duelPhone = layout(...phone, CUT.duel);
  const duelTablet = layout(...tablet, CUT.duel);
  assert.equal(duelTablet.cols * duelTablet.rows, duelPhone.cols * duelPhone.rows);
  assert.ok(duelTablet.cell > duelPhone.cell);
});
