import { test } from "node:test";
import assert from "node:assert/strict";

import { keyAction } from "./keys.js";
import { PERSONA_IDS } from "./bot.js";

/**
 * A key means different things on different cards, so every case here names
 * the screen it is on. That is the whole reason this module exists: it was
 * pulled out of the canvas effect because the far seat had steering keys and
 * no way to start the duel it needed, and nothing anywhere said so. A roster
 * reachable by thumb and not by key would be the identical bug one card in.
 */

test("keyAction: the arrows steer the near player, in game", () => {
  assert.deepEqual(keyAction("ArrowUp", "game"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("ArrowDown", "game"), { kind: "steer", seat: "bottom", dir: "down" });
  assert.deepEqual(keyAction("ArrowLeft", "game"), { kind: "steer", seat: "bottom", dir: "left" });
  assert.deepEqual(keyAction("ArrowRight", "game"), { kind: "steer", seat: "bottom", dir: "right" });
});

test("keyAction: wasd and ijkl give a duel two hands on one keyboard", () => {
  assert.deepEqual(keyAction("w", "game"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("s", "game"), { kind: "steer", seat: "bottom", dir: "down" });
  assert.deepEqual(keyAction("a", "game"), { kind: "steer", seat: "bottom", dir: "left" });
  assert.deepEqual(keyAction("d", "game"), { kind: "steer", seat: "bottom", dir: "right" });
  assert.deepEqual(keyAction("i", "game"), { kind: "steer", seat: "top", dir: "up" });
  assert.deepEqual(keyAction("k", "game"), { kind: "steer", seat: "top", dir: "down" });
  assert.deepEqual(keyAction("j", "game"), { kind: "steer", seat: "top", dir: "left" });
  assert.deepEqual(keyAction("l", "game"), { kind: "steer", seat: "top", dir: "right" });
});

test("keyAction: a held shift or caps lock still steers", () => {
  assert.deepEqual(keyAction("W", "game"), { kind: "steer", seat: "bottom", dir: "up" });
  assert.deepEqual(keyAction("L", "game"), { kind: "steer", seat: "top", dir: "right" });
});

test("keyAction: a steering key on the title card steers nothing", () => {
  // There is no strand yet. Swallowing the press would only stop the browser
  // scrolling a page that has nothing to scroll.
  for (const key of ["ArrowUp", "w", "i"]) {
    assert.equal(keyAction(key, "title"), null);
    assert.equal(keyAction(key, "roster"), null);
  }
});

test("keyAction: both people-counting modes can be started without a pointer", () => {
  assert.deepEqual(keyAction("1", "title"), { kind: "start", mode: "solo" });
  assert.deepEqual(keyAction("2", "title"), { kind: "start", mode: "duel" });
});

test("keyAction: enter and space start the one-player game", () => {
  assert.deepEqual(keyAction("Enter", "title"), { kind: "start", mode: "solo" });
  assert.deepEqual(keyAction(" ", "title"), { kind: "start", mode: "solo" });
});

test("keyAction: b opens the roster, because a bot game has no player count", () => {
  // `1` and `2` are how many people are playing, which is all `Mode` is. A bot
  // match is one person, same as solo, so there is no third number for it to
  // be — the key is a mnemonic instead.
  assert.deepEqual(keyAction("b", "title"), { kind: "roster" });
  assert.deepEqual(keyAction("B", "title"), { kind: "roster" });
});

test("keyAction: every persona on the roster has a key, in the order drawn", () => {
  PERSONA_IDS.forEach((persona, i) => {
    assert.deepEqual(keyAction(String(i + 1), "roster"), { kind: "pick", persona });
  });
  assert.equal(keyAction(String(PERSONA_IDS.length + 1), "roster"), null);
});

test("keyAction: the roster can be left without playing anybody", () => {
  // Tapping BOT to see who is in there must not commit you to a duel with one
  // of them. Escape is the key half of the drawn way out.
  assert.deepEqual(keyAction("Escape", "roster"), { kind: "back" });
});

test("keyAction: enter and escape acknowledge a card mid-game", () => {
  assert.deepEqual(keyAction("Enter", "game"), { kind: "dismiss" });
  assert.deepEqual(keyAction(" ", "game"), { kind: "dismiss" });
  assert.deepEqual(keyAction("Escape", "game"), { kind: "dismiss" });
});

test("keyAction: every screen can be left by key alone", () => {
  // The invariant that matters: no card is a dead end for someone without a
  // pointer. Title starts a game, roster picks or backs out, game dismisses.
  assert.ok(keyAction("Enter", "title"));
  assert.ok(keyAction("Escape", "roster"));
  assert.ok(keyAction("Escape", "game"));
});

test("keyAction: anything else is not ours to swallow", () => {
  // Tab belongs to whoever is navigating with it, on every card.
  for (const screen of ["title", "roster", "game"]) {
    for (const key of ["Tab", "q", "F5", "9"]) {
      assert.equal(keyAction(key, screen), null, `${key} was swallowed on ${screen}`);
    }
  }
  assert.equal(keyAction("Escape", "title"), null);
  assert.equal(keyAction("b", "game"), null);
});
