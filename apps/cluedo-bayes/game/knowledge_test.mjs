import { test } from "node:test";
import assert from "node:assert/strict";

import { PLAYER_COUNT } from "./cards.js";
import {
  holderOf,
  knownNotToHold,
  learnDisjunction,
  learnPass,
  learnShown,
  newKnowledge,
} from "./knowledge.js";

const HAND = ["scarlett", "rope", "kitchen", "library", "wrench"];

test("newKnowledge: my own hand is located, and ruled out for everyone else", () => {
  const k = newKnowledge(0, HAND);
  for (const c of HAND) {
    assert.equal(holderOf(k, c), 0);
    for (let p = 1; p < PLAYER_COUNT; p++) {
      assert.ok(knownNotToHold(k, p, c), `${c} should be ruled out for player ${p}`);
    }
  }
});

test("newKnowledge: says nothing about cards I do not hold", () => {
  const k = newKnowledge(0, HAND);
  assert.equal(holderOf(k, "plum"), undefined);
  for (let p = 0; p < PLAYER_COUNT; p++) {
    assert.equal(knownNotToHold(k, p, "plum"), false);
  }
});

test("learnShown: a card shown to me is located and ruled out elsewhere", () => {
  const k = newKnowledge(0, HAND);
  learnShown(k, "plum", 2);
  assert.equal(holderOf(k, "plum"), 2);
  assert.ok(knownNotToHold(k, 1, "plum"));
  assert.ok(knownNotToHold(k, 3, "plum"));
  assert.equal(knownNotToHold(k, 2, "plum"), false, "the holder is not ruled out");
});

test("learnShown: never overwrites what is already known", () => {
  const k = newKnowledge(0, HAND);
  // Someone appearing to show a card I hold would be a protocol violation;
  // trusting it would corrupt every later deduction.
  learnShown(k, "rope", 3);
  assert.equal(holderOf(k, "rope"), 0);
});

test("learnPass: a player who could not disprove holds none of the three", () => {
  const k = newKnowledge(0, HAND);
  learnPass(k, 1, ["plum", "revolver", "study"]);
  for (const c of ["plum", "revolver", "study"]) {
    assert.ok(knownNotToHold(k, 1, c));
    assert.equal(knownNotToHold(k, 2, c), false, "only that player passed");
  }
});

test("learnDisjunction: records that a player holds at least one of three", () => {
  const k = newKnowledge(0, HAND);
  learnDisjunction(k, 2, ["plum", "revolver", "study"]);
  assert.equal(k.disjunctions.length, 1);
  assert.equal(k.disjunctions[0].player, 2);
  assert.deepEqual([...k.disjunctions[0].cards].sort(), ["plum", "revolver", "study"]);
});

test("learnDisjunction: drops a clause already satisfied by a known card", () => {
  const k = newKnowledge(0, HAND);
  learnShown(k, "plum", 2);
  // We already know player 2 holds plum, so "2 holds one of these" adds nothing
  // and would only slow the sampler down.
  learnDisjunction(k, 2, ["plum", "revolver", "study"]);
  assert.equal(k.disjunctions.length, 0);
});

test("learnDisjunction: keeps a clause about a different player", () => {
  const k = newKnowledge(0, HAND);
  learnShown(k, "plum", 2);
  learnDisjunction(k, 3, ["plum", "revolver", "study"]);
  assert.equal(k.disjunctions.length, 1);
});

test("a pass narrowing a disjunction to one card is enough to solve it", () => {
  // The classic chain: player 2 holds one of three; two of them are later
  // ruled out for player 2, so the third is theirs.
  const k = newKnowledge(0, HAND);
  learnDisjunction(k, 2, ["plum", "revolver", "study"]);
  learnPass(k, 2, ["plum"]);
  learnPass(k, 2, ["revolver"]);
  const clause = k.disjunctions[0];
  const live = clause.cards.filter((c) => !knownNotToHold(k, clause.player, c));
  assert.deepEqual(live, ["study"]);
});
