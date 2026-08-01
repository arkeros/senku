import { test } from "node:test";
import assert from "node:assert/strict";

import { ALL_CARDS, ENVELOPE, HAND_SIZES, PLAYER_COUNT, ROOMS, SUSPECTS, WEAPONS, categoryOf, deal } from "./cards.js";
import { learnDisjunction, learnPass, learnShown, newKnowledge } from "./knowledge.js";
import { solve } from "./solver.js";

/** Mulberry32 — a real generator, so the sampler explores rather than repeats. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knowledge for player 0 in a real deal, plus the deal itself. */
function table(seed) {
  const d = deal(seeded(seed));
  return { d, k: newKnowledge(0, d.hands[0]) };
}

test("solve: samples at least some worlds from an opening position", () => {
  const { k } = table(1);
  const sol = solve(k, { target: 300, random: seeded(7) });
  assert.ok(sol.accepted > 50, `only accepted ${sol.accepted}`);
});

test("solve: every sampled world is internally consistent", () => {
  const { d, k } = table(2);
  learnShown(k, d.hands[2][0], 2);
  learnPass(k, 1, [SUSPECTS[0], WEAPONS[0], ROOMS[0]]);
  const sol = solve(k, { target: 200, random: seeded(11) });

  for (const w of sol.worlds) {
    // One card per category in the envelope.
    assert.deepEqual(w.envelope.map(categoryOf).sort(), ["room", "suspect", "weapon"]);

    // Hand sizes are respected once located cards are counted in.
    for (let p = 0; p < PLAYER_COUNT; p++) {
      const total = w.hands[p].length + [...k.located.values()].filter((h) => h === p).length;
      assert.equal(total, HAND_SIZES[p], `player ${p} hand size`);
    }

    // Every card is somewhere, exactly once.
    const placed = [...w.envelope, ...w.hands.flat(), ...k.located.keys()];
    assert.equal(new Set(placed).size, ALL_CARDS.length, "a card is missing or duplicated");
  }
});

test("solve: sampled worlds never contradict a ruled-out pairing", () => {
  const { k } = table(3);
  learnPass(k, 1, ["plum", "revolver", "study"]);
  learnPass(k, 2, ["plum", "revolver"]);
  const sol = solve(k, { target: 200, random: seeded(5) });
  assert.ok(sol.accepted > 20);

  for (const w of sol.worlds) {
    for (const c of ["plum", "revolver", "study"]) {
      assert.ok(!w.hands[1].includes(c), `player 1 was ruled out of ${c}`);
    }
    for (const c of ["plum", "revolver"]) {
      assert.ok(!w.hands[2].includes(c), `player 2 was ruled out of ${c}`);
    }
  }
});

test("solve: sampled worlds satisfy every disjunction", () => {
  const { d, k } = table(4);
  // Player 3 showed someone a card from this triple.
  const triple = [SUSPECTS[3], WEAPONS[3], ROOMS[3]].filter((c) => !d.hands[0].includes(c));
  if (triple.length === 3) {
    learnDisjunction(k, 3, triple);
    const sol = solve(k, { target: 200, random: seeded(13) });
    assert.ok(sol.accepted > 20, `only ${sol.accepted} worlds`);
    for (const w of sol.worlds) {
      assert.ok(
        triple.some((c) => w.hands[3].includes(c) || k.located.get(c) === 3),
        "a world ignored the disjunction",
      );
    }
  }
});

test("solve: my own cards are never placed anywhere else", () => {
  const { d, k } = table(5);
  const sol = solve(k, { target: 200, random: seeded(3) });
  for (const w of sol.worlds) {
    for (const mine of d.hands[0]) {
      assert.ok(!w.envelope.includes(mine), `${mine} is mine, not in the envelope`);
      for (let p = 1; p < PLAYER_COUNT; p++) {
        assert.ok(!w.hands[p].includes(mine), `${mine} is mine, not player ${p}'s`);
      }
    }
  }
});

test("solve: probabilities are a distribution over locations", () => {
  const { k } = table(6);
  const sol = solve(k, { target: 300, random: seeded(9) });
  for (const card of ALL_CARDS) {
    const spread = sol.locationProb.get(card);
    const total = spread.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${card} sums to ${total}`);
    assert.equal(spread.length, PLAYER_COUNT + 1);
  }
});

test("solve: cards I hold are certain, and never in the envelope", () => {
  const { d, k } = table(7);
  const sol = solve(k, { target: 200, random: seeded(21) });
  for (const mine of d.hands[0]) {
    assert.equal(sol.envelopeProb.get(mine), 0);
    assert.equal(sol.locationProb.get(mine)[0], 1);
  }
});

test("solve: exactly one card per category sits in the envelope, in expectation", () => {
  const { k } = table(8);
  const sol = solve(k, { target: 400, random: seeded(31) });
  for (const list of [SUSPECTS, WEAPONS, ROOMS]) {
    const mass = list.reduce((a, c) => a + sol.envelopeProb.get(c), 0);
    assert.ok(Math.abs(mass - 1) < 1e-9, `category mass ${mass}`);
  }
});

test("solve: the truth is always among the sampled worlds", () => {
  const { d, k } = table(9);
  const sol = solve(k, { target: 400, random: seeded(41) });
  const truth = [...d.envelope].sort().join("|");
  const seen = new Set(sol.worlds.map((w) => [...w.envelope].sort().join("|")));
  assert.ok(seen.has(truth), "the real envelope was never sampled");
  assert.ok(sol.envelopeProb.get(d.envelope[0]) > 0);
});

test("solve: knowing two of three collapses that category to certainty", () => {
  const { d, k } = table(10);
  // Locate every suspect except the guilty one.
  for (const s of SUSPECTS) {
    if (s === d.envelope[0]) continue;
    if (!k.located.has(s)) {
      const holder = d.hands.findIndex((h) => h.includes(s));
      if (holder >= 0) learnShown(k, s, holder);
    }
  }
  const sol = solve(k, { target: 200, random: seeded(51) });
  assert.equal(sol.envelopeProb.get(d.envelope[0]), 1);
  assert.equal(sol.locationProb.get(d.envelope[0])[ENVELOPE], 1);
});

test("solve: reports the leading theory", () => {
  const { k } = table(11);
  const sol = solve(k, { target: 300, random: seeded(61) });
  assert.ok(sol.topTheory);
  assert.equal(sol.topTheory.cards.length, 3);
  assert.ok(sol.topTheory.p > 0 && sol.topTheory.p <= 1);
});

test("solve: the same seed gives the same answer", () => {
  const { k } = table(12);
  const a = solve(k, { target: 200, random: seeded(77) });
  const b = solve(k, { target: 200, random: seeded(77) });
  assert.equal(a.accepted, b.accepted);
  assert.deepEqual(a.topTheory, b.topTheory);
});
