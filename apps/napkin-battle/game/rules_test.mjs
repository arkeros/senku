import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MODES,
  isFinished,
  neighbors,
  opponent,
  play,
  score,
  stainCandidates,
  startGame,
  undo,
} from "./rules.js";

/** Build a `size × size` board from a sparse `{index: "b5" | "r3"}` map. */
const boardOf = (size, marks) =>
  Array.from({ length: size * size }, (_unused, i) => {
    const spec = marks[i];
    if (!spec) return null;
    return {
      player: spec[0] === "b" ? "blue" : "red",
      value: Number(spec.slice(1)),
    };
  });

test("neighbors: a corner has two orthogonal neighbors", () => {
  assert.deepEqual(neighbors(0, 3), [1, 3]);
  assert.deepEqual(neighbors(8, 3), [5, 7]);
});

test("neighbors: the center of a 3x3 has four", () => {
  assert.deepEqual(neighbors(4, 3), [1, 3, 5, 7]);
});

test("neighbors: rows do not wrap around", () => {
  // Index 2 is the top-right corner; 3 is the start of the next row.
  assert.deepEqual(neighbors(2, 3), [1, 5]);
  assert.deepEqual(neighbors(3, 3), [0, 4, 6]);
});

test("score: an empty board is goalless", () => {
  assert.deepEqual(score(boardOf(3, {}), 3), { blue: 0, red: 0 });
});

test("score: the higher number takes the point from a rival neighbor", () => {
  assert.deepEqual(score(boardOf(3, { 0: "b5", 1: "r3" }), 3), {
    blue: 1,
    red: 0,
  });
  assert.deepEqual(score(boardOf(3, { 0: "b3", 1: "r5" }), 3), {
    blue: 0,
    red: 1,
  });
});

test("score: equal numbers cancel out", () => {
  assert.deepEqual(score(boardOf(3, { 0: "b5", 1: "r5" }), 3), {
    blue: 0,
    red: 0,
  });
});

test("score: neighbors of the same player never fight", () => {
  assert.deepEqual(score(boardOf(3, { 0: "b7", 1: "b1" }), 3), {
    blue: 0,
    red: 0,
  });
});

test("score: each rival pair is counted once, not once per side", () => {
  // 0-1 (blue wins), 0-3 (tie). Diagonal 0-4 is not adjacency.
  assert.deepEqual(score(boardOf(3, { 0: "b5", 1: "r3", 3: "r5", 4: "r7" }), 3), {
    blue: 1,
    red: 0,
  });
});

test("score: a 7 in the middle beats all four neighbors", () => {
  assert.deepEqual(
    score(boardOf(3, { 4: "b7", 1: "r6", 3: "r6", 5: "r6", 7: "r6" }), 3),
    { blue: 4, red: 0 },
  );
});

test("stainCandidates: the odd-sized center is excluded", () => {
  // The center is the only cell fixed by every rotation of a 3x3, so a stain
  // there would leave the board symmetric and the mirroring draw intact.
  assert.deepEqual(stainCandidates(3), [0, 1, 2, 3, 5, 6, 7, 8]);
});

test("stainCandidates: an even-sized board has no fixed cell to avoid", () => {
  assert.equal(stainCandidates(4).length, 16);
});

test("isFinished: an untouched board is not finished", () => {
  assert.equal(
    isFinished({
      board: boardOf(3, {}),
      hands: { blue: [1, 2], red: [1, 2] },
      stain: 0,
    }),
    false,
  );
});

test("isFinished: both hands empty ends the game", () => {
  assert.equal(
    isFinished({
      board: boardOf(3, {}),
      hands: { blue: [], red: [] },
      stain: 0,
    }),
    true,
  );
});

test("isFinished: no free cell left ends the game even with tiles in hand", () => {
  const full = {};
  for (let i = 1; i < 9; i++) full[i] = "b1";
  assert.equal(
    isFinished({
      board: boardOf(3, full),
      hands: { blue: [7], red: [7] },
      stain: 0,
    }),
    true,
  );
});

test("MODES: classic runs out of tiles one cell before the napkin fills up", () => {
  const { size, tiles } = MODES.classic;
  assert.equal(size * size - 1 - tiles * 2, 1);
});

test("MODES: lightning fills every free cell exactly", () => {
  const { size, tiles } = MODES.lightning;
  assert.equal(size * size - 1 - tiles * 2, 0);
});

test("opponent: turns alternate", () => {
  assert.equal(opponent("blue"), "red");
  assert.equal(opponent("red"), "blue");
});

test("startGame: blue opens with a full hand on an empty napkin", () => {
  const game = startGame("lightning", 0);
  assert.equal(game.size, 3);
  assert.equal(game.board.length, 9);
  assert.ok(game.board.every((cell) => cell === null));
  assert.deepEqual(game.hands, { blue: [1, 2, 3, 4], red: [1, 2, 3, 4] });
  assert.equal(game.turn, "blue");
  assert.deepEqual(game.history, []);
});

test("play: writes the number, spends the tile, hands over the turn", () => {
  const after = play(startGame("lightning", 0), 4, 3);
  assert.deepEqual(after.board[4], { player: "blue", value: 3 });
  assert.deepEqual(after.hands.blue, [1, 2, 4]);
  assert.deepEqual(after.hands.red, [1, 2, 3, 4]);
  assert.equal(after.turn, "red");
  assert.deepEqual(after.history, [{ index: 4, player: "blue", value: 3 }]);
});

test("play: leaves the game untouched on an illegal move", () => {
  const game = play(startGame("lightning", 0), 4, 3);
  assert.equal(play(game, 4, 1), game, "cell already written on");
  assert.equal(play(game, 0, 1), game, "the coffee stain");

  const afterRed = play(game, 1, 3);
  assert.equal(play(afterRed, 2, 3), afterRed, "tile already spent");
});

test("play: refuses to write once the game is over", () => {
  let game = startGame("lightning", 0);
  // Eight tiles into eight free cells fills the lightning napkin exactly.
  for (const index of [1, 2, 3, 4, 5, 6, 7, 8]) {
    game = play(game, index, game.hands[game.turn][0]);
  }
  assert.equal(isFinished(game), true);
  assert.equal(play(game, 0, 1), game);
});

test("undo: rewinds the board, the hand and the turn", () => {
  const game = startGame("lightning", 0);
  const rewound = undo(play(game, 4, 3));
  assert.deepEqual(rewound.board, game.board);
  assert.deepEqual(rewound.hands, game.hands);
  assert.equal(rewound.turn, "blue");
  assert.deepEqual(rewound.history, []);
});

test("undo: puts the tile back in sorted order", () => {
  const game = play(startGame("lightning", 0), 4, 2);
  assert.deepEqual(undo(game).hands.blue, [1, 2, 3, 4]);
});

test("undo: a fresh game has nothing to rewind", () => {
  const game = startGame("lightning", 0);
  assert.equal(undo(game), game);
});
