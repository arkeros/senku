import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chord,
  fieldFrom,
  flagCount,
  layPeppers,
  neighbours,
  pepperCount,
  pick,
  relayAround,
  reveal,
  swept,
  takenBy,
  toggleFlag,
} from "./field.js";

/**
 * A minefield spelled out. `*` is a pepper, `.` is cold — far easier to read
 * back than a list of indices, and every case below is about a shape.
 */
const mapOf = (...rows) =>
  fieldFrom(
    rows[0].length,
    rows.length,
    rows.flatMap((row) => [...row].map((ch) => ch === "*")),
  );

const at = (field, col, row) => row * field.cols + col;
const kinds = (field) => field.tiles.map((t) => t.kind);
const hidden = (field) => kinds(field).filter((k) => k === "hidden").length;

// ---- shape ------------------------------------------------------------------

test("fieldFrom: every cold cell counts the peppers touching it", () => {
  const field = mapOf(
    "*..",
    "...",
    "..*",
  );
  assert.deepEqual(field.near, [0, 1, 0, 1, 2, 1, 0, 1, 0]);
});

test("fieldFrom: a pepper's own count is filled in too, for chording", () => {
  const field = mapOf("**");
  assert.deepEqual(field.near, [1, 1]);
});

test("fieldFrom: every tile starts hidden", () => {
  const field = mapOf("*.", "..");
  assert.deepEqual(kinds(field), ["hidden", "hidden", "hidden", "hidden"]);
});

test("neighbours: a cell touches eight, fewer against the rim", () => {
  const field = mapOf("...", "...", "...");
  assert.equal(neighbours(field, at(field, 1, 1)).length, 8);
  assert.equal(neighbours(field, at(field, 0, 1)).length, 5);
  assert.equal(neighbours(field, at(field, 0, 0)).length, 3);
});

test("neighbours: the rim does not wrap around to the far side", () => {
  const field = mapOf("...", "...", "...");
  assert.ok(!neighbours(field, at(field, 0, 1)).includes(at(field, 2, 0)));
  assert.ok(!neighbours(field, at(field, 0, 1)).includes(at(field, 2, 1)));
});

// ---- laying the peppers -----------------------------------------------------

test("layPeppers: lays exactly as many as asked for", () => {
  const field = layPeppers(6, 6, 7, Math.random);
  assert.equal(pepperCount(field), 7);
});

test("layPeppers: draws by index, so a fixed random is a fixed board", () => {
  // `() => 0` always takes the first candidate still in the bag.
  const field = layPeppers(3, 3, 3, () => 0);
  assert.deepEqual(field.hot.slice(0, 3), [true, true, true]);
  assert.deepEqual(field.hot.slice(3), [false, false, false, false, false, false]);
});

test("layPeppers: a random of 1 stays inside the bag", () => {
  const field = layPeppers(4, 4, 5, () => 0.9999999);
  assert.equal(pepperCount(field), 5);
});

test("layPeppers: never lays on a cell held cold", () => {
  const cold = [0, 1, 2, 3];
  const field = layPeppers(3, 3, 5, () => 0, cold);
  for (const i of cold) assert.equal(field.hot[i], false);
  assert.equal(pepperCount(field), 5);
});

test("layPeppers: asking for more peppers than there is room for fills what fits", () => {
  const field = layPeppers(2, 2, 99, () => 0);
  assert.equal(pepperCount(field), 4);
});

test("relayAround: the first tap and everything it touches come up cold", () => {
  const field = layPeppers(6, 6, 10, () => 0);
  const tap = at(field, 3, 3);
  const relaid = relayAround(field, tap, () => 0);
  assert.equal(relaid.hot[tap], false);
  for (const n of neighbours(relaid, tap)) assert.equal(relaid.hot[n], false);
  assert.equal(relaid.near[tap], 0);
});

test("relayAround: the same number of peppers, just somewhere else", () => {
  const field = layPeppers(6, 6, 10, () => 0);
  assert.equal(pepperCount(relayAround(field, at(field, 3, 3), () => 0)), 10);
});

test("relayAround: a board with no room to move them keeps what it can", () => {
  // 3x3 with 9 peppers has nowhere cold to put them; the opening wins.
  const relaid = relayAround(layPeppers(3, 3, 9, () => 0), 4, () => 0);
  assert.equal(relaid.hot[4], false);
});

// ---- revealing --------------------------------------------------------------

test("reveal: a numbered cell opens on its own", () => {
  const field = mapOf(
    "*..",
    "...",
    "...",
  );
  const out = reveal(field, at(field, 1, 0));
  assert.deepEqual(out.opened, [at(field, 1, 0)]);
  assert.equal(out.bitten, null);
  assert.equal(out.field.tiles[at(field, 1, 0)].kind, "revealed");
});

test("reveal: an empty cell floods out and stops on the numbers", () => {
  const field = mapOf(
    "*....",
    ".....",
    ".....",
  );
  const out = reveal(field, at(field, 4, 2));
  // Everything but the pepper itself: the numbers ringing it are opened, and
  // the flood does not step past them.
  assert.equal(out.opened.length, 14);
  assert.ok(!out.opened.includes(at(field, 0, 0)));
  assert.equal(out.field.tiles[at(field, 0, 0)].kind, "hidden");
});

test("reveal: the flood does not walk through a flag", () => {
  const field = mapOf(
    ".....",
    ".....",
    ".....",
  );
  const flagged = toggleFlag(field, at(field, 2, 1));
  const out = reveal(flagged, at(field, 0, 0));
  assert.ok(!out.opened.includes(at(field, 2, 1)));
  assert.equal(out.field.tiles[at(field, 2, 1)].kind, "flagged");
});

test("reveal: a pepper bites, and says which one", () => {
  const field = mapOf("*.", "..");
  const out = reveal(field, 0);
  assert.equal(out.bitten, 0);
  assert.equal(out.field.tiles[0].kind, "revealed");
});

test("reveal: an open tile is a no-op, not a second flood", () => {
  const field = mapOf(".*", "..");
  const once = reveal(field, 0);
  const twice = reveal(once.field, 0);
  assert.deepEqual(twice.opened, []);
  assert.equal(twice.field, once.field);
});

test("reveal: a flagged tile is left alone", () => {
  const field = toggleFlag(mapOf(".*", ".."), 0);
  const out = reveal(field, 0);
  assert.deepEqual(out.opened, []);
  assert.equal(out.field.tiles[0].kind, "flagged");
});

// ---- flagging ---------------------------------------------------------------

test("toggleFlag: on, then off again", () => {
  const field = mapOf("*.", "..");
  const on = toggleFlag(field, 1);
  assert.equal(on.tiles[1].kind, "flagged");
  assert.equal(toggleFlag(on, 1).tiles[1].kind, "hidden");
});

test("toggleFlag: an open tile cannot be flagged", () => {
  const opened = reveal(mapOf("*.", ".."), 1).field;
  assert.equal(toggleFlag(opened, 1).tiles[1].kind, "revealed");
});

test("flagCount: how many are planted, right or wrong", () => {
  const field = toggleFlag(toggleFlag(mapOf("*..", "...", "..."), 0), 4);
  assert.equal(flagCount(field), 2);
});

// ---- chording ---------------------------------------------------------------

test("chord: does nothing until the flags match the number", () => {
  const field = reveal(
    mapOf(
      "*..",
      "...",
      "...",
    ),
    4,
  ).field;
  assert.deepEqual(chord(field, 4).opened, []);
});

test("chord: with the number satisfied, the rest of the ring opens", () => {
  const field = mapOf(
    "*..",
    "...",
    "...",
  );
  const seen = reveal(field, 4).field;
  const marked = toggleFlag(seen, 0);
  const out = chord(marked, 4);
  assert.equal(out.bitten, null);
  assert.equal(hidden(out.field), 0);
});

test("chord: a flag in the wrong place bites you", () => {
  const field = mapOf(
    "*..",
    "...",
    "...",
  );
  // The `1` at centre is satisfied by a flag on a cold cell, so the pepper
  // itself is still in the ring that opens.
  const out = chord(toggleFlag(reveal(field, 4).field, 1), 4);
  assert.equal(out.bitten, 0);
});

test("chord: an empty or unopened cell is not chordable", () => {
  const field = mapOf(".*.", "...", "...");
  assert.deepEqual(chord(field, 4).opened, []);
  const flooded = reveal(field, at(field, 0, 2)).field;
  assert.deepEqual(chord(flooded, at(field, 0, 2)).opened, []);
});

// ---- the duel pick ----------------------------------------------------------

test("pick: a pepper goes to whoever found it", () => {
  const field = mapOf("*.", "..");
  const out = pick(field, 0, "left");
  assert.equal(out.got, true);
  assert.deepEqual(out.field.tiles[0], { kind: "taken", by: "left" });
  assert.deepEqual(out.opened, []);
});

test("pick: a cold cell opens like any other reveal and takes nothing", () => {
  const field = mapOf(
    "*....",
    ".....",
    ".....",
  );
  const out = pick(field, at(field, 4, 2), "right");
  assert.equal(out.got, false);
  assert.equal(out.opened.length, 14);
});

test("pick: a pepper already on someone's plate is a no-op", () => {
  const taken = pick(mapOf("*.", ".."), 0, "left").field;
  const again = pick(taken, 0, "right");
  assert.equal(again.got, false);
  assert.deepEqual(again.field.tiles[0], { kind: "taken", by: "left" });
});

test("takenBy: counts one player's peppers only", () => {
  const field = mapOf("**", "..");
  const one = pick(field, 0, "left").field;
  const two = pick(one, 1, "right").field;
  assert.equal(takenBy(two, "left"), 1);
  assert.equal(takenBy(two, "right"), 1);
});

// ---- the end ----------------------------------------------------------------

test("swept: true once every cold cell is open, the peppers left buried", () => {
  const field = mapOf(
    "*..",
    "...",
    "...",
  );
  assert.equal(swept(field), false);
  const out = reveal(field, at(field, 2, 2));
  assert.equal(out.field.tiles[0].kind, "hidden");
  assert.equal(swept(out.field), true);
});

test("swept: a flag is not a reveal", () => {
  const field = mapOf("*.", "..");
  const flagged = toggleFlag(toggleFlag(toggleFlag(field, 1), 2), 3);
  assert.equal(swept(flagged), false);
});

test("pepperCount: how many are out there at all", () => {
  assert.equal(pepperCount(mapOf("*.*", ".*.")), 3);
});
