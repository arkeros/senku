import { test } from "node:test";
import assert from "node:assert/strict";

import { modeButtons, personaRows, scoreCard } from "./scene.js";
import { PERSONA_IDS } from "../game/bot.js";

/**
 * The geometry, and only the geometry.
 *
 * Nothing here draws — there is no canvas to draw on. What it covers is the
 * arithmetic that decides where things go, which is exactly the part that had
 * a right answer and got it wrong: the bot's score card was landing on top of
 * the near player's, and thirty-three passing tests had nothing to say about
 * it. A `ctx` call is hard to test and rarely worth it. Working out *where* is
 * neither.
 */

/** A short phone, which is the size everything here is tightest on. */
const SHORT = { w: 360, h: 600 };
const TALL = { w: 400, h: 900 };

const overlaps = (a, b) => a.y < b.y + b.h && b.y < a.y + a.h;

test("modeButtons: three of them, in order, never touching", () => {
  for (const { w, h } of [SHORT, TALL]) {
    const { solo, bot, duel } = modeButtons(w, h);
    assert.ok(solo.y < bot.y && bot.y < duel.y, "the buttons are out of order");
    assert.ok(!overlaps(solo, bot) && !overlaps(bot, duel), "two buttons overlap");
  }
});

test("modeButtons: the last one is still on the phone", () => {
  // Three is the most this card holds, and the short phone is where that was
  // decided. A fourth would end at 591 of 600, which is why the personas got
  // a card of their own.
  for (const { w, h } of [SHORT, TALL]) {
    const { duel } = modeButtons(w, h);
    assert.ok(duel.y + duel.h < h, `the duel button runs off a ${h}px screen`);
  }
});

test("personaRows: one row per persona, none of them under a thumb's worth", () => {
  for (const { w, h } of [SHORT, TALL]) {
    const { rows, back } = personaRows(w, h);
    assert.deepEqual(Object.keys(rows), [...PERSONA_IDS]);

    const all = [...PERSONA_IDS.map((id) => rows[id]), back];
    for (const rect of all) assert.ok(rect.h >= 44 * 0.8, "a row is too small to hit");
    for (let i = 1; i < all.length; i++) {
      assert.ok(!overlaps(all[i - 1], all[i]), "two roster rows overlap");
    }
    assert.ok(back.y + back.h < h, "the way out is off the screen");
    assert.ok(all[0].y > 0, "the first row is off the top");
  }
});

test("scoreCard: solo puts the only card at the near end, the right way up", () => {
  const { reader, y } = scoreCard("solo", null, "bottom", 800, 60);
  assert.equal(reader, "bottom");
  assert.equal(y, 800 - 30);
});

test("scoreCard: a duel gives each end its own card, each facing its own player", () => {
  const near = scoreCard("duel", null, "bottom", 800, 60);
  const far = scoreCard("duel", null, "top", 800, 60);

  assert.equal(near.reader, "bottom");
  assert.equal(far.reader, "top");
  // Both are written for the near band; the rotation is what carries the far
  // one to the other end of the table.
  assert.equal(near.y, far.y);
});

test("scoreCard: a bot's card goes to the far end and stays the right way up", () => {
  // The regression. Placement follows the seat, orientation follows the
  // reader, and the bug was letting the second decide the first — the far
  // card stopped rotating, so it stopped moving, so it drew over PESTO's.
  const near = scoreCard("duel", "brava", "bottom", 800, 60);
  const far = scoreCard("duel", "brava", "top", 800, 60);

  assert.equal(far.reader, "bottom", "nobody is sitting at the far end to read it");
  assert.notEqual(far.y, near.y, "the bot's card is on top of the player's");
  assert.equal(far.y, 30, "the bot's card is not in the far band");
  assert.equal(near.y, 800 - 30);
});
