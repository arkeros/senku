import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_CELL, cellAt, centerOf, layout, refit } from "./board.js";

/** How solo cuts a screen, and a portrait phone — the shape this is played on. */
const ACROSS = 8;
const board = layout(400, 800, ACROSS);

test("layout: the grid is centred inside the viewport", () => {
  // To within a pixel: an odd leftover cannot be split evenly, and origins
  // are whole numbers so the grid lines land on pixel boundaries.
  const evenly = (span, cells, origin) => Math.abs(span - cells - origin * 2) <= 1;
  assert.ok(evenly(400, board.cols * board.cell, board.originX));
  assert.ok(evenly(800, board.rows * board.cell, board.originY));
});

test("layout: the short edge is cut into about `cellsAcross` columns", () => {
  assert.ok(Math.abs(board.cols - ACROSS) <= 1);
});

test("layout: the grid clears the bands the score strip is drawn in", () => {
  assert.ok(board.originY >= board.pad + board.band);
  assert.ok(board.rows * board.cell + (board.pad + board.band) * 2 <= 800);
});

test("layout: the long edge is filled, not squared off", () => {
  // The whole point of cutting off the short edge: a tall screen gets more
  // rows rather than a small board floating in the middle of it.
  assert.ok(board.rows > board.cols);
  const spare = 800 - board.rows * board.cell - (board.pad + board.band) * 2;
  assert.ok(spare < board.cell);
});

test("layout: a coarser cut is bigger cells, not a smaller board", () => {
  const coarse = layout(390, 844, 6);
  const fine = layout(390, 844, 8);
  assert.ok(coarse.cell > fine.cell);
  assert.ok(coarse.cols < fine.cols);
  // Both still reach the bottom of the same screen.
  assert.ok(844 - coarse.rows * coarse.cell - (coarse.pad + coarse.band) * 2 < coarse.cell);
});

test("layout: cells never shrink below a thumb on a small screen", () => {
  const tiny = layout(240, 380, ACROSS);
  assert.ok(tiny.cell >= MIN_CELL);
  assert.ok(tiny.cols >= 5 && tiny.rows >= 5);
});

test("layout: a landscape window still fits inside its padding", () => {
  const wide = layout(900, 500, ACROSS);
  assert.ok(wide.cols * wide.cell <= 900);
  assert.ok(wide.rows * wide.cell <= 500);
  assert.ok(wide.cols > wide.rows);
});

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
