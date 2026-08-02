import { test } from "node:test";
import assert from "node:assert/strict";

import { ROOMS, SUSPECTS, WEAPONS, deal } from "./cards.js";
import { learnShown, newKnowledge } from "./knowledge.js";
import { solve } from "./solver.js";
import { bestSuggestion, entropyOf, envelopeEntropy, expectedGain } from "./information.js";

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const table = (seed, target = 500) => {
  const d = deal(seeded(seed));
  const k = newKnowledge(0, d.hands[0]);
  return { d, k, sol: solve(k, { target, random: seeded(seed * 31 + 7) }) };
};

test("entropyOf: a certainty carries no information", () => {
  assert.equal(entropyOf(new Map([["only", 10]]), 10), 0);
});

test("entropyOf: n equally likely options is log2(n) bits", () => {
  const counts = new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1]]);
  assert.ok(Math.abs(entropyOf(counts, 4) - 2) < 1e-12);
  assert.ok(Math.abs(entropyOf(new Map([["a", 1], ["b", 1]]), 2) - 1) < 1e-12);
});

test("entropyOf: a skewed distribution sits below uniform", () => {
  const skewed = entropyOf(new Map([["a", 9], ["b", 1]]), 10);
  assert.ok(skewed > 0 && skewed < 1, `got ${skewed}`);
});

test("envelopeEntropy: an opening position is genuinely uncertain", () => {
  const { sol } = table(1);
  const h = envelopeEntropy(sol.worlds);
  // 324 possible triples at the start; my five cards cut that down, but there
  // is still several bits of doubt.
  assert.ok(h > 3, `only ${h} bits of uncertainty`);
  assert.ok(h < Math.log2(324) + 1e-9);
});

test("envelopeEntropy: agreeing worlds carry no uncertainty", () => {
  const one = [{ envelope: ["plum", "rope", "study"], hands: [[], [], [], []] }];
  assert.equal(envelopeEntropy(one), 0);
  assert.equal(envelopeEntropy([...one, ...one, ...one]), 0);
});

test("expectedGain: never negative", () => {
  const { sol } = table(2);
  for (const s of SUSPECTS.slice(0, 3)) {
    for (const w of WEAPONS.slice(0, 2)) {
      assert.ok(expectedGain(sol, 0, [s, w, ROOMS[0]]) >= 0);
    }
  }
});

test("expectedGain: cannot exceed the uncertainty available to remove", () => {
  const { sol } = table(3);
  const prior = envelopeEntropy(sol.worlds);
  for (const s of SUSPECTS.slice(0, 4)) {
    const g = expectedGain(sol, 0, [s, WEAPONS[1], ROOMS[2]]);
    assert.ok(g <= prior + 1e-9, `${g} bits gained from ${prior} available`);
  }
});

test("expectedGain: suggesting only my own cards teaches me nothing", () => {
  // Nobody can disprove it, so there is exactly one possible outcome and the
  // posterior equals the prior. This is the classic beginner's mistake.
  const { d, sol } = table(4);
  const mine = {
    suspect: SUSPECTS.find((c) => d.hands[0].includes(c)),
    weapon: WEAPONS.find((c) => d.hands[0].includes(c)),
    room: ROOMS.find((c) => d.hands[0].includes(c)),
  };
  if (mine.suspect && mine.weapon && mine.room) {
    const g = expectedGain(sol, 0, [mine.suspect, mine.weapon, mine.room]);
    assert.ok(g < 1e-9, `expected ~0 bits, got ${g}`);
  }
});

test("expectedGain: asking about cards I have already located teaches nothing", () => {
  const { d, k } = table(5);
  // Locate one card of each category in another player's hand.
  const found = {};
  for (const [cat, list] of [["suspect", SUSPECTS], ["weapon", WEAPONS], ["room", ROOMS]]) {
    for (let p = 1; p < 4; p++) {
      const card = list.find((c) => d.hands[p].includes(c));
      if (card && !found[cat]) {
        learnShown(k, card, p);
        found[cat] = card;
      }
    }
  }
  if (found.suspect && found.weapon && found.room) {
    const sol = solve(k, { target: 400, random: seeded(99) });
    const g = expectedGain(sol, 0, [found.suspect, found.weapon, found.room]);
    // A responder shows a card the suggester already knows whenever they can,
    // so the outcome is deterministic and no bits change hands.
    assert.ok(g < 0.02, `expected ~0 bits, got ${g}`);
  }
});

test("expectedGain: a genuinely uncertain triple is worth real bits", () => {
  const { sol } = table(6);
  let best = 0;
  for (const s of SUSPECTS) {
    for (const w of WEAPONS) {
      best = Math.max(best, expectedGain(sol, 0, [s, w, ROOMS[0]]));
    }
  }
  assert.ok(best > 0.3, `best was only ${best} bits`);
});

test("bestSuggestion: returns a legal triple with a score", () => {
  const { sol } = table(7);
  const best = bestSuggestion(sol, 0);
  assert.ok(best);
  const [s, w, r] = best.suggestion;
  assert.ok(SUSPECTS.includes(s), `${s} is not a suspect`);
  assert.ok(WEAPONS.includes(w), `${w} is not a weapon`);
  assert.ok(ROOMS.includes(r), `${r} is not a room`);
  assert.ok(best.bits >= 0);
});

test("bestSuggestion: is at least as good as an arbitrary triple", () => {
  const { sol } = table(8);
  const best = bestSuggestion(sol, 0);
  const arbitrary = expectedGain(sol, 0, [SUSPECTS[0], WEAPONS[0], ROOMS[0]]);
  assert.ok(best.bits >= arbitrary - 1e-9, `${best.bits} < ${arbitrary}`);
});

test("expectedGain: too few worlds to reason from scores nothing", () => {
  // Rather than divide by a handful of samples and report noise as insight.
  const thin = { worlds: [], knownHands: [[], [], [], []] };
  assert.equal(expectedGain(thin, 0, [SUSPECTS[0], WEAPONS[0], ROOMS[0]]), 0);
});
