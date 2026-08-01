import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_CARDS,
  ENVELOPE,
  HAND_SIZES,
  PLAYER_COUNT,
  ROOMS,
  SUSPECTS,
  WEAPONS,
  categoryOf,
  deal,
} from "./cards.js";

/** Deterministic stand-in for Math.random. */
const scripted = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test("the deck is the standard 21 cards, all distinct", () => {
  assert.equal(SUSPECTS.length, 6);
  assert.equal(WEAPONS.length, 6);
  assert.equal(ROOMS.length, 9);
  assert.equal(ALL_CARDS.length, 21);
  assert.equal(new Set(ALL_CARDS).size, 21, "duplicate card id");
});

test("card ids are opaque identifiers, not display text", () => {
  // Display names live in the MF2 catalogs; ids must never leak into the UI.
  for (const card of ALL_CARDS) {
    assert.match(card, /^[a-z][a-zA-Z]*$/, `${card} does not look like an id`);
  }
});

test("categoryOf classifies every card", () => {
  for (const c of SUSPECTS) assert.equal(categoryOf(c), "suspect");
  for (const c of WEAPONS) assert.equal(categoryOf(c), "weapon");
  for (const c of ROOMS) assert.equal(categoryOf(c), "room");
});

test("the deal accounts for every card exactly once", () => {
  for (let seed = 0; seed < 40; seed++) {
    const d = deal(scripted([seed / 40, (seed * 7) % 40 / 40, (seed * 13) % 40 / 40, 0.5, 0.1, 0.9]));
    const dealt = [...d.envelope, ...d.hands.flat()];
    assert.equal(dealt.length, 21, "cards went missing or were duplicated");
    assert.equal(new Set(dealt).size, 21);
  }
});

test("the envelope holds exactly one of each category", () => {
  for (let seed = 0; seed < 40; seed++) {
    const d = deal(scripted([seed / 40, 0.3, 0.7, 0.11, 0.42]));
    const cats = d.envelope.map(categoryOf).sort();
    assert.deepEqual(cats, ["room", "suspect", "weapon"]);
  }
});

test("hands are dealt to the declared sizes", () => {
  const d = deal(scripted([0.2, 0.5, 0.8, 0.35]));
  assert.equal(d.hands.length, PLAYER_COUNT);
  assert.deepEqual(d.hands.map((h) => h.length), [...HAND_SIZES]);
  // 21 cards, 3 sealed, 18 dealt.
  assert.equal(HAND_SIZES.reduce((a, b) => a + b, 0), 18);
});

test("ENVELOPE is a location index past the last player", () => {
  assert.equal(ENVELOPE, PLAYER_COUNT);
});
