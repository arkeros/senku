import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROUNDS_TO_WIN,
  SHORT_EDGE_CELLS,
  START_LENGTH,
  advance,
  centerOf,
  eat,
  endRound,
  inBounds,
  layout,
  newMatch,
  newSnake,
  newSnakes,
  opposite,
  refit,
  spawnFood,
  step,
  stepInterval,
  tick,
  turn,
} from "./rules.js";

/** A portrait phone, the shape this game is actually played on. */
const board = layout(400, 800);

const at = (col, row) => ({ col, row });
const same = (a, b) => a.col === b.col && a.row === b.row;
const has = (cells, cell) => cells.some((c) => same(c, cell));

/** A snake spelled out cell by cell, for the cases a fresh one can't reach. */
const snakeOf = (seat, dir, body, extra = {}) => ({
  seat,
  dir,
  body,
  queue: [],
  alive: true,
  ...extra,
});

/** `step` with the parts a test doesn't care about filled in. */
const run = (snakes, { food = [], random = () => 0 } = {}) =>
  step({ board, snakes, food, random });

// ---- geometry ---------------------------------------------------------------

test("layout: the grid is centred inside the viewport", () => {
  assert.equal(board.originX * 2 + board.cols * board.cell, 400);
  assert.equal(board.originY * 2 + board.rows * board.cell, 800);
});

test("layout: the short edge is divided into about SHORT_EDGE_CELLS columns", () => {
  assert.ok(Math.abs(board.cols - SHORT_EDGE_CELLS) <= 1);
});

test("layout: both dimensions are even, so the two seats are mirror images", () => {
  assert.equal(board.cols % 2, 0);
  assert.equal(board.rows % 2, 0);
  const tiny = layout(120, 200);
  assert.equal(tiny.cols % 2, 0);
  assert.equal(tiny.rows % 2, 0);
});

test("layout: cells never shrink below a tappable size on a small screen", () => {
  const tiny = layout(120, 200);
  assert.ok(tiny.cell >= 12);
  assert.ok(tiny.cols >= 8 && tiny.rows >= 8);
});

test("layout: a landscape viewport still fits inside its padding", () => {
  const wide = layout(800, 400);
  assert.ok(wide.cols * wide.cell <= 800);
  assert.ok(wide.rows * wide.cell <= 400);
  assert.ok(wide.cols > wide.rows);
});

test("refit: a resize mid-round rescales the grid instead of redrawing it", () => {
  // A phone's URL bar collapsing changes the height by a few percent. Every
  // cell a strand is lying on has to survive that, so the grid keeps its
  // dimensions and only the pixels move.
  const shorter = refit(board, 400, 700);
  assert.equal(shorter.cols, board.cols);
  assert.equal(shorter.rows, board.rows);
  assert.ok(shorter.cell < board.cell);
});

test("refit: the rescaled grid still fits, score bands and all", () => {
  const shorter = refit(board, 400, 700);
  assert.equal(shorter.originX * 2 + shorter.cols * shorter.cell, 400);
  assert.ok(shorter.rows * shorter.cell <= 700);
  assert.ok(shorter.originY > 0);
});

test("centerOf: a cell's centre is half a cell in from its corner", () => {
  const p = centerOf(board, at(0, 0));
  assert.equal(p.x, board.originX + board.cell / 2);
  assert.equal(p.y, board.originY + board.cell / 2);
});

test("advance: each heading moves exactly one cell", () => {
  assert.deepEqual(advance(at(3, 4), "up"), at(3, 3));
  assert.deepEqual(advance(at(3, 4), "down"), at(3, 5));
  assert.deepEqual(advance(at(3, 4), "left"), at(2, 4));
  assert.deepEqual(advance(at(3, 4), "right"), at(4, 4));
});

test("opposite: headings pair up", () => {
  assert.equal(opposite("up"), "down");
  assert.equal(opposite("left"), "right");
  assert.equal(opposite(opposite("up")), "up");
});

test("inBounds: the plate's rim is exclusive", () => {
  assert.ok(inBounds(board, at(0, 0)));
  assert.ok(inBounds(board, at(board.cols - 1, board.rows - 1)));
  assert.ok(!inBounds(board, at(-1, 0)));
  assert.ok(!inBounds(board, at(board.cols, 0)));
  assert.ok(!inBounds(board, at(0, board.rows)));
});

// ---- starting positions -----------------------------------------------------

test("newSnake: starts at START_LENGTH with its body trailing behind the head", () => {
  const s = newSnake(board, "bottom");
  assert.equal(s.body.length, START_LENGTH);
  assert.equal(s.dir, "up");
  // Every segment sits one cell further back along the heading.
  for (let i = 1; i < s.body.length; i++) {
    assert.deepEqual(s.body[i], advance(s.body[i - 1], opposite(s.dir)));
  }
  assert.ok(s.body.every((c) => inBounds(board, c)));
});

test("newSnake: the two seats are 180° rotations of each other", () => {
  const bottom = newSnake(board, "bottom");
  const top = newSnake(board, "top");
  assert.equal(top.dir, opposite(bottom.dir));
  for (let i = 0; i < START_LENGTH; i++) {
    assert.deepEqual(top.body[i], {
      col: board.cols - 1 - bottom.body[i].col,
      row: board.rows - 1 - bottom.body[i].row,
    });
  }
});

test("newSnake: the seats start apart, each heading at the other", () => {
  const [bottom, top] = [newSnake(board, "bottom"), newSnake(board, "top")];
  assert.ok(bottom.body[0].row > top.body[0].row);
  assert.equal(bottom.dir, "up");
  assert.equal(top.dir, "down");
});

test("newSnakes: solo puts one strand on the plate, duel two", () => {
  assert.equal(newSnakes(board, "solo").length, 1);
  assert.equal(newSnakes(board, "solo")[0].seat, "bottom");
  assert.deepEqual(
    newSnakes(board, "duel").map((s) => s.seat),
    ["bottom", "top"],
  );
});

// ---- turning ----------------------------------------------------------------

test("turn: a legal turn is queued, not applied immediately", () => {
  const s = turn(newSnake(board, "bottom"), "left");
  assert.equal(s.dir, "up", "the heading only changes when the snake moves");
  assert.deepEqual(s.queue, ["left"]);
});

test("turn: doubling back on yourself is refused", () => {
  const s = newSnake(board, "bottom");
  assert.deepEqual(turn(s, "down").queue, []);
});

test("turn: repeating the current heading is not queued", () => {
  assert.deepEqual(turn(newSnake(board, "bottom"), "up").queue, []);
});

test("turn: two flicks inside one tick cannot reverse the snake", () => {
  // up → left is fine, and left → down would be fine a tick later. Applying
  // both at once would spin the head straight back into the neck, so the
  // second turn is judged against the first, not against the live heading.
  let s = turn(newSnake(board, "bottom"), "left");
  s = turn(s, "down");
  assert.deepEqual(s.queue, ["left", "down"]);
  const after = run([s]).snakes[0];
  assert.equal(after.dir, "left", "one turn per move, in the order they arrived");
  assert.deepEqual(after.queue, ["down"]);
});

test("turn: the queue does not grow without bound", () => {
  let s = newSnake(board, "bottom");
  for (const d of ["left", "down", "right", "up", "left"]) s = turn(s, d);
  assert.ok(s.queue.length <= 2);
});

test("turn: a dead snake ignores the flick", () => {
  const dead = { ...newSnake(board, "bottom"), alive: false };
  assert.deepEqual(turn(dead, "left").queue, []);
});

// ---- moving -----------------------------------------------------------------

test("step: the snake advances one cell and keeps its length", () => {
  const before = newSnake(board, "bottom");
  const after = run([before]).snakes[0];
  assert.deepEqual(after.body[0], advance(before.body[0], "up"));
  assert.equal(after.body.length, before.body.length);
  assert.ok(!has(after.body, before.body.at(-1)), "the tail cell is vacated");
});

test("step: eating grows the snake and takes the meatball off the plate", () => {
  const before = newSnake(board, "bottom");
  const meatball = advance(before.body[0], "up");
  const out = run([before], { food: [meatball] });
  assert.equal(out.snakes[0].body.length, before.body.length + 1);
  assert.deepEqual(out.ate, ["bottom"]);
  assert.ok(!has(out.food, meatball), "the eaten meatball is gone");
});

test("step: a fresh meatball appears once one is eaten", () => {
  const before = newSnake(board, "bottom");
  const out = run([before], { food: [advance(before.body[0], "up")] });
  assert.equal(out.food.length, 1);
});

test("step: a meatball never lands under a snake", () => {
  const snake = newSnake(board, "bottom");
  // Every draw picks the last free cell, whichever that turns out to be.
  const out = run([snake], { food: [], random: () => 0.999999 });
  assert.equal(out.food.length, 1);
  assert.ok(!has(out.snakes[0].body, out.food[0]));
});

test("step: running off the plate is fatal", () => {
  const edge = snakeOf("bottom", "up", [at(4, 0), at(4, 1), at(4, 2)]);
  const out = run([edge]);
  assert.deepEqual(out.died, ["bottom"]);
  assert.equal(out.snakes[0].alive, false);
});

test("step: biting your own flank is fatal", () => {
  // Coiled tight enough that turning down puts the head onto its fourth
  // segment — a cell well away from the tail, so nothing is vacating it.
  const coiled = snakeOf("bottom", "left", [
    at(5, 5),
    at(6, 5),
    at(6, 6),
    at(5, 6),
    at(4, 6),
    at(4, 5),
  ]);
  const out = run([turn(coiled, "down")]);
  assert.deepEqual(out.died, ["bottom"]);
});

test("step: the cell a tail is vacating is safe to enter", () => {
  // Head at (5,5) chasing its own tail at (5,6). By the time the head lands
  // there the tail has already moved on, so this is a legal loop, not a bite.
  const loop = snakeOf("bottom", "left", [at(5, 5), at(6, 5), at(6, 6), at(5, 6)]);
  const out = run([turn(loop, "down")]);
  assert.deepEqual(out.died, []);
  assert.deepEqual(out.snakes[0].body[0], at(5, 6));
});

test("step: a snake that eats keeps its tail, so the same loop bites", () => {
  const loop = snakeOf("bottom", "left", [at(5, 5), at(6, 5), at(6, 6), at(5, 6)]);
  // A meatball on the neck cell it is about to grow into.
  const out = run([turn(loop, "down")], { food: [at(5, 6)] });
  assert.deepEqual(out.died, ["bottom"]);
});

test("step: a dead snake stays put", () => {
  const dead = { ...newSnake(board, "bottom"), alive: false };
  const out = run([dead]);
  assert.deepEqual(out.snakes[0].body, dead.body);
  assert.deepEqual(out.died, []);
});

// ---- two strands ------------------------------------------------------------

test("step: crashing into the rival kills only whoever crashed", () => {
  const victim = snakeOf("bottom", "up", [at(5, 6), at(5, 7), at(5, 8)]);
  const wall = snakeOf("top", "right", [at(6, 5), at(5, 5), at(4, 5)]);
  const out = run([victim, wall]);
  assert.deepEqual(out.died, ["bottom"]);
  assert.equal(out.snakes[1].alive, true);
});

test("step: a head-on meeting takes both strands", () => {
  // Two heads one cell apart, closing on the same square.
  const a = snakeOf("bottom", "up", [at(5, 6), at(5, 7), at(5, 8)]);
  const b = snakeOf("top", "down", [at(5, 4), at(5, 3), at(5, 2)]);
  const out = run([a, b]);
  assert.deepEqual(out.died.sort(), ["bottom", "top"]);
});

test("step: both strands move on the same tick", () => {
  const snakes = newSnakes(board, "duel");
  const out = run(snakes);
  assert.deepEqual(out.snakes[0].body[0], advance(snakes[0].body[0], "up"));
  assert.deepEqual(out.snakes[1].body[0], advance(snakes[1].body[0], "down"));
});

// ---- meatballs --------------------------------------------------------------

test("spawnFood: the draw is decided by the injected randomness", () => {
  const first = spawnFood(board, [], () => 0);
  const last = spawnFood(board, [], () => 0.999999);
  assert.deepEqual(first, at(0, 0));
  assert.notDeepEqual(first, last);
});

test("spawnFood: occupied cells are never chosen", () => {
  const taken = [at(0, 0), at(1, 0)];
  assert.ok(!has(taken, spawnFood(board, taken, () => 0)));
});

test("spawnFood: a full plate has nowhere to put one", () => {
  const every = [];
  for (let col = 0; col < board.cols; col++) {
    for (let row = 0; row < board.rows; row++) every.push(at(col, row));
  }
  assert.equal(spawnFood(board, every, () => 0), null);
});

// ---- the match --------------------------------------------------------------

test("newMatch: opens on the countdown with nothing scored", () => {
  const m = newMatch("duel");
  assert.equal(m.phase, "ready");
  assert.ok(m.timer > 0);
  assert.deepEqual(m.rounds, { bottom: 0, top: 0 });
  assert.equal(m.eaten, 0);
  assert.equal(m.winner, null);
});

test("eat: counts the meatball", () => {
  assert.equal(eat(newMatch("solo")).eaten, 1);
  assert.equal(eat(eat(newMatch("solo"))).eaten, 2);
});

test("stepInterval: the plate speeds up as you eat, then holds", () => {
  const cold = stepInterval(newMatch("solo"));
  let m = newMatch("solo");
  for (let i = 0; i < 10; i++) m = eat(m);
  const warm = stepInterval(m);
  for (let i = 0; i < 200; i++) m = eat(m);
  const fast = stepInterval(m);
  assert.ok(warm < cold);
  assert.ok(fast < warm);
  assert.ok(fast > 0);
  assert.equal(stepInterval({ ...m, eaten: m.eaten + 500 }), fast, "it bottoms out");
});

test("tick: the countdown runs down into play", () => {
  const m = tick(newMatch("solo"), newMatch("solo").timer + 1);
  assert.equal(m.phase, "play");
});

test("tick: play and end are not on a timer", () => {
  const playing = tick(tick(newMatch("solo"), 999), 999);
  assert.equal(playing.phase, "play");
  const over = endRound(playing, ["bottom"]);
  assert.equal(tick(over, 999), over);
});

test("endRound: solo ends the match outright", () => {
  const m = endRound(newMatch("solo"), ["bottom"]);
  assert.equal(m.phase, "end");
  assert.equal(m.winner, null);
});

test("endRound: solo keeps the score for the game-over card", () => {
  const m = endRound(eat(eat(newMatch("solo"))), ["bottom"]);
  assert.equal(m.eaten, 2);
});

test("endRound: in a duel the survivor takes the round", () => {
  const m = endRound(newMatch("duel"), ["top"]);
  assert.deepEqual(m.rounds, { bottom: 1, top: 0 });
  assert.equal(m.lastRound, "bottom");
  assert.equal(m.phase, "round");
  assert.ok(m.timer > 0);
});

test("endRound: a head-on collision scores for nobody", () => {
  const m = endRound(newMatch("duel"), ["bottom", "top"]);
  assert.deepEqual(m.rounds, { bottom: 0, top: 0 });
  assert.equal(m.lastRound, null);
  assert.equal(m.phase, "round");
});

test("endRound: the next round starts on a clean plate", () => {
  const m = endRound(eat(eat(newMatch("duel"))), ["top"]);
  assert.equal(m.eaten, 0, "speed resets with the strands");
});

test("endRound: winning ROUNDS_TO_WIN rounds ends the match", () => {
  let m = newMatch("duel");
  for (let i = 0; i < ROUNDS_TO_WIN; i++) m = endRound(m, ["top"]);
  assert.equal(m.rounds.bottom, ROUNDS_TO_WIN);
  assert.equal(m.phase, "end");
  assert.equal(m.winner, "bottom");
});

test("endRound: a finished match ignores further rounds", () => {
  let m = newMatch("duel");
  for (let i = 0; i < ROUNDS_TO_WIN; i++) m = endRound(m, ["top"]);
  assert.equal(endRound(m, ["bottom"]), m);
});

test("tick: after a round the countdown comes back", () => {
  const m = tick(endRound(newMatch("duel"), ["top"]), 999);
  assert.equal(m.phase, "ready");
  assert.ok(m.timer > 0);
});

test("ROUNDS_TO_WIN: best of five", () => {
  assert.equal(ROUNDS_TO_WIN, 3);
});
