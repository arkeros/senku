import { test } from "node:test";
import assert from "node:assert/strict";

import { PERSONAS, botDir, roomBeyond } from "./bot.js";
import {
  advance,
  newSnake,
  occupiedCells,
  opposite,
  spawnFood,
  step,
  turn,
} from "./rules.js";

/**
 * No test in this file may depend on the *magnitude* of a tuning constant.
 *
 * The bot has weights in it, and the weights are the thing most likely to be
 * changed. A test that fails when `horizon` moves from 50 to 60 is not
 * protecting anything — it is pinning a number nobody promised. Every board
 * below is cut so that the answer is forced by a gate, or by the *sign* of a
 * weight, and would still be the answer at any other setting.
 */

const DIRS = ["up", "down", "left", "right"];

/**
 * A hand-cut plate. `layout` derives one from a viewport, which is the wrong
 * end of the telescope here: a bot test wants a board small enough to draw on
 * paper, with the walls in known places. Only `cols` and `rows` reach the bot;
 * the pixel fields are along for the ride.
 */
const plate = (cols, rows) => ({ cols, rows, cell: 10, originX: 0, originY: 0, pad: 0 });

const at = (col, row) => ({ col, row });

/** A strand of `length`, head first, laid out behind the head it is given. */
const strand = (head, dir, length = 3, seat = "bottom") => {
  const body = [head];
  for (let i = 1; i < length; i++) body.push(advance(body[i - 1], opposite(dir)));
  return { seat, body, dir, queue: [], alive: true };
};

/** A strand whose exact shape matters — cells head first, drawn out by hand. */
const laid = (body, dir, seat = "bottom") => ({ seat, body, dir, queue: [], alive: true });

const TRAITS = { horizon: 40, appetite: 1, menace: 0, trade: "refuse" };

const input = (over) => ({
  board: plate(20, 20),
  self: strand(at(10, 10), "up"),
  foe: null,
  food: [at(10, 4)],
  traits: TRAITS,
  ...over,
});

test("botDir: hands back a heading, always", () => {
  // Even cornered, even doomed. There is no "no opinion" — `step` is going to
  // move the strand whatever the bot thinks about it.
  assert.ok(DIRS.includes(botDir(input())));
});

test("botDir: never answers with the reversal", () => {
  // `turn` would drop it, so this cannot crash the game — which is exactly why
  // it needs a test. A reversal handed to `turn` is a move the bot silently
  // failed to make, and nothing anywhere would say so.
  for (const dir of DIRS) {
    const chosen = botDir(input({ self: strand(at(10, 10), dir) }));
    assert.notEqual(chosen, opposite(dir), `heading ${dir} was answered with its reversal`);
  }
});

// ---- gate 1: the move must not be fatal on arrival -------------------------
//
// Every board below is read from the cell the head is *gliding into*, not the
// cell it is standing on. `step` completes the heading already spoken for and
// only then takes a queued one, so what the bot is choosing is the move after
// next, launched from one cell further on. Planning from `body[0]` steers out
// of the cell behind the head, which is the bug commit b639603 fixed for the
// far player's flicks.

test("botDir: will not carry straight on over the edge of the plate", () => {
  // Head one row off the top wall and pointing at it: the move already spoken
  // for lands on row 0, so continuing up leaves the plate.
  const chosen = botDir(input({ self: strand(at(5, 1), "up") }));
  assert.notEqual(chosen, "up");
});

test("botDir: will not turn into a cell its own body still holds", () => {
  //      5   6   7   8            The head is at (5,5) going right, so it is
  //  4   ·   #   #   ·            gliding into (6,5). From there: straight on
  //  5   H   ·   #   #            is (7,5) and up is (6,4), both still body
  //  6   ·   ·   ·   ·            when the move lands. Only down is free.
  const self = laid(
    [at(5, 5), at(5, 4), at(6, 4), at(7, 4), at(7, 5), at(8, 5)],
    "right",
  );
  assert.equal(botDir(input({ self })), "down");
});

test("botDir: a cell the tail is leaving is not a wall", () => {
  //      5   6   7             Against the top wall, head at (5,0) going
  //  0   H   ·   T             right. Up leaves the plate and down is body,
  //  1   #   #   #             so the only move is into (7,0) — which is the
  //                            tail, and the tail is gone by the time the
  // head gets there. A bot that treats a strand as furniture rather than as
  // something moving finds no legal move here at all.
  const self = laid([at(5, 0), at(5, 1), at(6, 1), at(7, 1), at(7, 0)], "right");
  assert.equal(botDir(input({ self })), "right");
});

test("botDir: a tail it is about to grow into is a wall after all", () => {
  //      10  11  12            Same shape, off the wall, but with a meatball
  //  9   ·   #   #             on the cell the head is gliding into. Eating
  // 10   H   ·   T             keeps the tail for that move, so (12,10) is
  // 11   ·   ·   ·             still occupied when the head arrives and the
  //                            only move left is down.
  const self = laid([at(10, 10), at(10, 9), at(11, 9), at(12, 9), at(12, 10)], "right");
  assert.equal(botDir(input({ self, food: [at(11, 10)] })), "down");
});

// ---- the fill: how much room is through that door --------------------------

test("roomBeyond: an open plate is as roomy as you can be bothered to count", () => {
  assert.equal(roomBeyond(plate(20, 20), [], at(10, 10), 12), 12);
});

test("roomBeyond: a sealed pocket counts out, however high the cap", () => {
  //  0   1        Two cells in the corner, with the way out bricked up.
  //  0  ·   #     Raising the cap does not invent room that is not there.
  //  1  ·   #
  //  2  #   ·
  const walls = [at(1, 0), at(1, 1), at(0, 2)];
  assert.equal(roomBeyond(plate(5, 5), walls, at(0, 0), 10), 2);
  assert.equal(roomBeyond(plate(5, 5), walls, at(0, 0), 100), 2);
});

test("roomBeyond: the cap is what makes a bot beatable, so it must bite", () => {
  // The same two cells, counted by something that stops at one. This is the
  // whole of ADR 0002 in one assertion: a short horizon cannot tell a coffin
  // from a ballroom, and that is the only reason a bot ever loses.
  const walls = [at(1, 0), at(1, 1), at(0, 2)];
  assert.equal(roomBeyond(plate(5, 5), walls, at(0, 0), 1), 1);
});

test("roomBeyond: there is no room on a cell that is already spaghetti", () => {
  assert.equal(roomBeyond(plate(5, 5), [at(2, 2)], at(2, 2), 10), 0);
  assert.equal(roomBeyond(plate(5, 5), [], at(-1, 2), 10), 0);
});

// ---- gate 2: the move must leave somewhere to go ---------------------------

/**
 * A pocket along the top of the plate, walled off by the *other* strand.
 *
 *        0   1   2   3   4   5   6   7   8   9
 *    0   x   ·   ·   ·   ·   ·   ·   ·   ·   ·     ← 10 free cells, and the
 *    1   F   F   F   F   F   F   F   F   F   ·       only way in is (9,1)
 *    2   ·   ·   ·   ·   ·   ·   ·   ·   ·   H     ← the head glides in here
 *    3   ·   ·   ·   ·   ·   ·   ·   ·   ·   S
 *
 * `F` is the far strand after its own next move, `S` the bot, `x` the far
 * strand's head. Straight on from `H` is the mouth of a ten-cell pocket; left
 * is the whole rest of the plate. The bot is twelve long, so the pocket is a
 * coffin — if it can see that far.
 */
const cornerTrap = (horizon) =>
  input({
    board: plate(10, 8),
    self: laid(
      [
        at(9, 3), at(9, 4), at(9, 5), at(9, 6), at(9, 7),
        at(8, 7), at(7, 7), at(6, 7), at(5, 7), at(4, 7), at(3, 7), at(2, 7),
      ],
      "up",
    ),
    foe: laid(
      [at(0, 1), at(1, 1), at(2, 1), at(3, 1), at(4, 1),
       at(5, 1), at(6, 1), at(7, 1), at(8, 1), at(9, 1)],
      "up",
      "top",
    ),
    food: [],
    traits: { ...TRAITS, horizon },
  });

test("botDir: refuses a pocket it would not fit inside", () => {
  assert.equal(botDir(cornerTrap(40)), "left");
});

test("botDir: walks into the same pocket when it cannot see the end of it", () => {
  // Nothing about the plate changed. The bot did not blunder, was not unlucky,
  // and did not roll a die — it counted five cells of room, which is all the
  // room it has ever been able to count, and five was enough.
  assert.equal(botDir(cornerTrap(5)), "up");
});

test("botDir: cornered, it takes the roomier grave", () => {
  //      0   1   2       Five long on a nine-cell plate. Left is one cell,
  //  0   ·   H   ·       right is three, and neither is survivable — but one
  //  1   #   S   ·       of them is three moves of being alive.
  //  2   #   #   ·
  const self = laid([at(1, 1), at(1, 2), at(0, 2), at(0, 1), at(0, 0)], "up");
  assert.equal(botDir(input({ board: plate(3, 3), self, food: [] })), "right");
});

// ---- the tie-break ---------------------------------------------------------

test("botDir: a tie is broken by carrying straight on", () => {
  // Open plate, nothing to eat, three equally empty ways to go. Pinned to a
  // value for the same reason commit 557ce2e pinned the diagonal flick: an
  // arbitrary answer still has to be the *same* arbitrary answer every time,
  // or the strand visibly dithers between two cells it has no reason to
  // prefer. Straight on is the one that looks like a decision.
  const self = strand(at(4, 4), "left");
  assert.equal(botDir(input({ board: plate(9, 9), self, food: [] })), "left");
});

// ---- the axes --------------------------------------------------------------
//
// Each of these turns one trait on against a board where every other influence
// is flat, so the assertion rides on the *sign* of a weight and not its size.
// Every one of them is paired with the same board at zero, because "it went
// left" is only evidence that appetite works if it went straight without it.

test("appetite: steers toward the meatball, and only because of appetite", () => {
  // Open plate, one meatball away to the left on the row the head is entering.
  // Straight on and right are the same distance from it as each other.
  const self = strand(at(7, 7), "up");
  const board = plate(15, 15);
  const board7 = { board, self, foe: null, food: [at(0, 6)] };

  assert.equal(botDir(input({ ...board7, traits: { ...TRAITS, appetite: 1 } })), "left");
  assert.equal(botDir(input({ ...board7, traits: { ...TRAITS, appetite: 0 } })), "up");
});

test("menace: steers toward the cells in front of the other head", () => {
  // Nothing to eat, so the only thing to want is ground. The far strand is
  // away to the left, which makes left the cell that crowds it.
  const scene = {
    board: plate(15, 15),
    self: strand(at(7, 10), "up"),
    foe: strand(at(2, 10), "up", 3, "top"),
    food: [],
  };

  assert.equal(botDir(input({ ...scene, traits: { ...TRAITS, appetite: 0, menace: 1 } })), "left");
  assert.equal(botDir(input({ ...scene, traits: { ...TRAITS, appetite: 0, menace: 0 } })), "up");
});

// ---- trade -----------------------------------------------------------------
//
// One board cannot separate all three values, and trying would mean weighing a
// meatball against a collision — which is exactly the magnitude comparison this
// file refuses to pin. Two boards do it on tie-breaks alone: on the first the
// risky cell is the one the bot would otherwise carry straight on into, on the
// second it is off to one side. Nothing else differs between the candidates, so
// any negative weight gives the first answer and any positive weight the second.

/** The far strand is head-on, so carrying straight on is the cell it might take. */
const headOn = (trade) =>
  input({
    board: plate(15, 15),
    self: strand(at(7, 10), "up"),
    foe: strand(at(7, 6), "down", 3, "top"),
    food: [],
    traits: { ...TRAITS, appetite: 0, menace: 0, trade },
  });

/** The far strand is off to the left, so the risky cell is one it must turn for. */
const alongside = (trade) =>
  input({
    board: plate(15, 15),
    self: strand(at(7, 10), "up"),
    foe: strand(at(5, 10), "up", 3, "top"),
    food: [],
    traits: { ...TRAITS, appetite: 0, menace: 0, trade },
  });

test("trade refuse: gives up the cell it wanted rather than swap paint", () => {
  // It would have gone straight on. It goes left instead, and it is the only
  // one of the three that does — a draw scores nobody and resets the round,
  // so a bot indifferent to trades converts a winning position into nothing.
  assert.equal(botDir(headOn("refuse")), "left");
});

test("trade neutral: is not coming for you and is not getting out of the way", () => {
  assert.equal(botDir(headOn("neutral")), "up");
  assert.equal(botDir(alongside("neutral")), "up");
});

test("trade seek: turns out of a clear road to take you with it", () => {
  // Straight on is free and safe. It turns anyway, which no other trait in
  // this file would make it do.
  assert.equal(botDir(alongside("seek")), "left");
});

// ---- the roster ------------------------------------------------------------

test("PERSONAS: five sauces, and between them every trade value", () => {
  assert.deepEqual(Object.keys(PERSONAS), ["ketchup", "mayo", "alioli", "brava", "kamikaze"]);

  // The roster is meant to showcase the knobs, so a trade value nobody uses is
  // a boolean with a spare state pretending to be an axis.
  const traded = new Set(Object.values(PERSONAS).map((t) => t.trade));
  assert.deepEqual([...traded].sort(), ["neutral", "refuse", "seek"]);
});

test("PERSONAS: nobody sees the whole plate", () => {
  // A horizon big enough to reach every corner is an uncapped fill wearing a
  // number, and the bot it produces never crashes. See ADR 0002.
  const widest = plate(28, 16).cols * plate(28, 16).rows;
  for (const [id, traits] of Object.entries(PERSONAS)) {
    assert.ok(traits.horizon < widest, `${id} can see the entire plate`);
  }
});

// ---- actually playing ------------------------------------------------------
//
// Everything above judges one decision. None of it would notice a bot that
// makes a defensible move every time and still dies in six, so this drives the
// real `step` for as long as it survives — the only test here that would catch
// the traits being wired to the wrong seat, or the plan being read from the
// cell behind the head.

/** A fixed generator, so a survival count is a fact rather than a mood. */
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/**
 * Put a bot alone on a small plate and let it play until it tangles.
 *
 * Alone, `menace` and `trade` are both worth nothing and appetite is the only
 * term left — which means its magnitude cancels and two personas differ here
 * by `horizon` and nothing else. That is exactly the comparison ADR 0002 is
 * about, run against the real rules rather than a contrived board.
 *
 * Small, because a strand has to grow long enough to be its own problem before
 * sight distance decides anything: on a full-size plate both of these were
 * still alive after six hundred moves.
 */
function lifespan(traits, limit = 4000) {
  const random = seeded(7);
  const board = plate(12, 12);
  let snake = newSnake(board, "bottom");
  let food = [spawnFood(board, occupiedCells([snake]), random)].filter(Boolean);

  for (let moves = 0; moves < limit; moves++) {
    snake = turn(snake, botDir({ board, self: snake, foe: null, food, traits }));
    const out = step({ board, snakes: [snake], food, random });
    snake = out.snakes[0];
    food = out.food;
    if (!snake.alive) return { moves, eaten: snake.body.length };
  }
  return { moves: limit, eaten: snake.body.length };
}

test("a bot plays a real round rather than merely answering questions", () => {
  // Three segments is where it starts. Anything that eats has understood the
  // board well enough to cross it on purpose.
  const { moves, eaten } = lifespan({ ...TRAITS, horizon: 64 });
  assert.ok(moves > 40, `it tangled after ${moves} moves`);
  assert.ok(eaten > 3, "it never ate anything");
});

test("seeing further is what keeps a bot alive", () => {
  // The claim ADR 0002 rests on, run against the real rules. Both of these
  // refuse a pocket smaller than themselves; one of them cannot tell. Alone on
  // a plate `menace` and `trade` are worth nothing and appetite's magnitude
  // cancels, so sight is the only difference there is between them.
  //
  // Deliberately far apart, and deliberately not two personas: which personas
  // outlive which is tuning, and tuning is what this file refuses to pin.
  const far = lifespan({ ...TRAITS, horizon: 64 });
  const near = lifespan({ ...TRAITS, horizon: 6 });
  assert.ok(
    far.moves > near.moves,
    `sighted lasted ${far.moves} moves and blind ${near.moves} — the horizon is not doing its job`,
  );
});
