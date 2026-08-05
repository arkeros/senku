import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_CELL, cellAt, centerOf, layout, refit } from "./board.js";

/** How solo cuts a screen, and a portrait phone — the shape this is played on. */
const FILL = { kind: "fill", cell: 44 };
const FIT = { kind: "fit", cols: 6, rows: 12 };
const board = layout(400, 800, FILL);

/** Phones, tablets and a desktop window — the range a web game actually meets. */
const SCREENS = [
  [375, 667],
  [390, 844],
  [440, 956],
  [744, 1133],
  [1024, 1366],
  [1440, 900],
];

test("layout: the grid is centred inside the viewport", () => {
  // To within a pixel: an odd leftover cannot be split evenly, and origins
  // are whole numbers so the grid lines land on pixel boundaries.
  const evenly = (span, cells, origin) => Math.abs(span - cells - origin * 2) <= 1;
  assert.ok(evenly(400, board.cols * board.cell, board.originX));
  assert.ok(evenly(800, board.rows * board.cell, board.originY));
});

test("layout: the grid clears the bands the score strip is drawn in", () => {
  assert.ok(board.originY >= board.pad + board.band);
  assert.ok(board.rows * board.cell + (board.pad + board.band) * 2 <= 800);
});

// ---- fill: the cells stay put and the count moves ----------------------------

test("fill: cells come out near the size asked for, on any screen", () => {
  for (const [w, h] of SCREENS) {
    const b = layout(w, h, FILL);
    assert.ok(Math.abs(b.cell - FILL.cell) <= 6, `${w}x${h} gave ${b.cell}px cells`);
  }
});

test("fill: nothing is left over across the screen", () => {
  // The column count is rounded to the nearest whole board and the cell size
  // taken from that, so a strip of unused screen down one side cannot happen.
  for (const [w, h] of SCREENS) {
    const b = layout(w, h, FILL);
    assert.ok(w - b.pad * 2 - b.cols * b.cell < b.cell);
    assert.ok(h - (b.pad + b.band) * 2 - b.rows * b.cell < b.cell);
  }
});

test("fill: a bigger screen is more board, not a bigger board", () => {
  const phone = layout(390, 844, FILL);
  const tablet = layout(1024, 1366, FILL);
  assert.ok(tablet.cols > phone.cols && tablet.rows > phone.rows);
  assert.ok(Math.abs(tablet.cell - phone.cell) <= 4);
});

test("fill: a landscape window fills sideways", () => {
  const wide = layout(1440, 900, FILL);
  assert.ok(wide.cols > wide.rows);
  assert.ok(wide.cols * wide.cell <= 1440);
  assert.ok(wide.rows * wide.cell <= 900);
});

// ---- fit: the count stays put and the cells move -----------------------------

test("fit: the board has exactly the dimensions asked for, on any screen", () => {
  for (const [w, h] of SCREENS) {
    const b = layout(w, h, FIT);
    assert.equal(b.cols, FIT.cols);
    assert.equal(b.rows, FIT.rows);
  }
});

test("fit: the cells grow to suit the screen", () => {
  assert.ok(layout(1024, 1366, FIT).cell > layout(390, 844, FIT).cell);
});

test("fit: the board reaches the edge on whichever axis binds", () => {
  // A fixed board cannot fill both axes of every screen, but it must reach
  // one of them, or it is a postage stamp in the middle of the glass.
  for (const [w, h] of SCREENS) {
    const b = layout(w, h, FIT);
    const spareW = w - b.pad * 2 - b.cols * b.cell;
    const spareH = h - (b.pad + b.band) * 2 - b.rows * b.cell;
    assert.ok(Math.min(spareW, spareH) < b.cell, `${w}x${h} leaves a whole cell spare`);
  }
});

// ---- the floor ---------------------------------------------------------------

test("layout: cells never shrink below a thumb on a small screen", () => {
  for (const cut of [FILL, FIT]) {
    const tiny = layout(240, 380, cut);
    assert.ok(tiny.cell >= MIN_CELL);
  }
  assert.ok(layout(240, 380, FILL).cols >= 5);
});

// ---- everything else ---------------------------------------------------------

test("refit: a resize mid-game rescales the grid instead of recutting it", () => {
  // The URL bar collapsing on the first tap changes the height by a few
  // percent. Re-cutting would renumber every cell under a half-swept board.
  const shorter = refit(board, 400, 700);
  assert.equal(shorter.cols, board.cols);
  assert.equal(shorter.rows, board.rows);
  assert.ok(shorter.cell < board.cell);
  assert.ok(shorter.rows * shorter.cell <= 700);
});

test("centerOf: a cell's middle is half a cell in from its corner", () => {
  const p = centerOf(board, 0, 0);
  assert.equal(p.x, board.originX + board.cell / 2);
  assert.equal(p.y, board.originY + board.cell / 2);
});

test("cellAt: the pixel under a finger names the cell it is on", () => {
  for (const [col, row] of [
    [0, 0],
    [3, 5],
    [board.cols - 1, board.rows - 1],
  ]) {
    const p = centerOf(board, col, row);
    assert.deepEqual(cellAt(board, p.x, p.y), { col, row });
  }
});

test("cellAt: a tap off the grid is not a cell", () => {
  assert.equal(cellAt(board, 0, 0), null);
  assert.equal(cellAt(board, 399, 799), null);
  assert.equal(cellAt(board, board.originX - 1, board.originY + 1), null);
});

test("cellAt: the rim belongs to the cell inside it, not the one past it", () => {
  const last = board.originX + board.cols * board.cell;
  assert.equal(cellAt(board, last - 0.5, board.originY + 1).col, board.cols - 1);
  assert.equal(cellAt(board, last + 0.5, board.originY + 1), null);
});
