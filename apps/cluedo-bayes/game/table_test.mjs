import { test } from "node:test";
import assert from "node:assert/strict";

import { PLAYER_COUNT } from "./cards.js";
import { holderOf, knownNotToHold, newKnowledge } from "./knowledge.js";
import { firstResponder, newShowHistory, recordShow, broadcast } from "./table.js";

const always = (v) => () => v;

/** Four hands with known contents, so responses are predictable. */
const HANDS = [
  ["scarlett", "rope", "kitchen"],
  ["mustard", "candlestick", "ballroom"],
  ["plum", "revolver", "conservatory"],
  ["green", "knife", "library"],
];

test("firstResponder: turn order starts left of the suggester", () => {
  const history = newShowHistory();
  // Suggesting player 2's cards: player 3 comes first in order, then 0, then 1.
  const r = firstResponder(HANDS, 0, ["plum", "knife", "ballroom"], history, always(0));
  assert.equal(r.shower, 1, "player 1 holds ballroom and comes before 2 and 3");
  assert.equal(r.card, "ballroom");
  assert.deepEqual(r.passers, [], "nobody earlier could pass");
});

test("firstResponder: players who cannot disprove are recorded as passers", () => {
  const history = newShowHistory();
  const r = firstResponder(HANDS, 0, ["green", "knife", "library"], history, always(0));
  assert.equal(r.shower, 3);
  assert.deepEqual(r.passers, [1, 2], "1 and 2 held none of them");
});

test("firstResponder: nobody can disprove a suggestion of the suggester's own cards", () => {
  const history = newShowHistory();
  const r = firstResponder(HANDS, 0, ["scarlett", "rope", "kitchen"], history, always(0));
  assert.equal(r.shower, null);
  assert.equal(r.card, null);
  assert.deepEqual(r.passers, [1, 2, 3]);
});

test("firstResponder: repeats a card already shown to this player, leaking nothing", () => {
  const history = newShowHistory();
  recordShow(history, 3, 0, "knife");
  // Player 3 holds both green and knife; they should re-show knife.
  const r = firstResponder(HANDS, 0, ["green", "knife", "study"], history, always(0.99));
  assert.equal(r.shower, 3);
  assert.equal(r.card, "knife", "should reuse the card player 0 has already seen");
});

test("firstResponder: a card shown to someone else is not treated as safe", () => {
  const history = newShowHistory();
  recordShow(history, 3, 1, "knife");
  // Shown to player 1, not player 0, so it carries no discount here. With a
  // source pinned to the first option, green is chosen.
  const r = firstResponder(HANDS, 0, ["green", "knife", "study"], history, always(0));
  assert.equal(r.card, "green");
});

test("broadcast: the suggester locates the card; bystanders only get a clause", () => {
  const ks = HANDS.map((hand, p) => newKnowledge(p, hand));
  broadcast(ks, 0, ["green", "knife", "study"], { shower: 3, card: "knife", passers: [1, 2] });

  assert.equal(holderOf(ks[0], "knife"), 3, "the suggester saw the card");
  assert.equal(holderOf(ks[1], "knife"), undefined, "a bystander did not");
  assert.equal(ks[1].disjunctions.length, 1, "but knows player 3 holds one of the three");
  assert.deepEqual(ks[1].disjunctions[0].cards, ["green", "knife", "study"]);
});

test("broadcast: the shower learns nothing new about their own card", () => {
  const ks = HANDS.map((hand, p) => newKnowledge(p, hand));
  broadcast(ks, 0, ["green", "knife", "study"], { shower: 3, card: "knife", passers: [1, 2] });
  assert.equal(ks[3].disjunctions.length, 0, "no clause about yourself");
});

test("broadcast: everyone learns what the passers do not hold", () => {
  const ks = HANDS.map((hand, p) => newKnowledge(p, hand));
  const suggestion = ["green", "knife", "study"];
  broadcast(ks, 0, suggestion, { shower: 3, card: "knife", passers: [1, 2] });
  for (let p = 0; p < PLAYER_COUNT; p++) {
    for (const passer of [1, 2]) {
      for (const c of suggestion) {
        assert.ok(knownNotToHold(ks[p], passer, c), `player ${p} should know ${passer} lacks ${c}`);
      }
    }
  }
});

test("broadcast: an undisproved suggestion still teaches everyone about the passers", () => {
  const ks = HANDS.map((hand, p) => newKnowledge(p, hand));
  const suggestion = ["scarlett", "rope", "kitchen"];
  broadcast(ks, 0, suggestion, { shower: null, card: null, passers: [1, 2, 3] });
  for (const c of suggestion) {
    assert.ok(knownNotToHold(ks[1], 2, c));
    assert.ok(knownNotToHold(ks[2], 3, c));
  }
  assert.equal(ks[1].disjunctions.length, 0, "nothing was shown, so no clause");
});
