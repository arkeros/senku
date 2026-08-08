import { PERSONA_IDS, type PersonaId } from "./bot.js";
import type { Dir, Mode, Seat } from "./rules";

/**
 * What a key press means.
 *
 * Sibling of `swipe`, and separate for the same reason: this is about the
 * hands, not the plate. Out of the component because the keyboard is the one
 * input a test can state exhaustively — while it lived inside the canvas
 * effect, the far seat had steering keys but no way to start the duel it
 * needed, and nothing said so.
 *
 * A press means different things on different cards, so the screen is an
 * argument. That is what lets `1`–`5` be personas on the roster and player
 * counts on the title without either having to give the digits up.
 */

/**
 * Which card is up. Lives here rather than beside `World` because `game/` must
 * not import from `render/`, and because a key press cannot be read without it.
 */
export type Screen = "title" | "roster" | "game";

/** Steer a strand, choose from the title, choose from the roster, or clear a card. */
export type KeyAction =
  | { readonly kind: "steer"; readonly seat: Seat; readonly dir: Dir }
  | { readonly kind: "start"; readonly mode: Mode }
  | { readonly kind: "roster" }
  | { readonly kind: "pick"; readonly persona: PersonaId }
  | { readonly kind: "back" }
  | { readonly kind: "dismiss" };

/**
 * Two hands on one keyboard: the near player takes the arrows or wasd, the
 * far one ijkl. Headings are given as the screen is drawn, exactly as
 * `swipeDir` reads a flick, so `i` sends the far strand up the screen no
 * matter which end of the table its owner is sitting at.
 */
const STEER: Readonly<Record<string, { readonly seat: Seat; readonly dir: Dir }>> = {
  ArrowUp: { seat: "bottom", dir: "up" },
  ArrowDown: { seat: "bottom", dir: "down" },
  ArrowLeft: { seat: "bottom", dir: "left" },
  ArrowRight: { seat: "bottom", dir: "right" },
  w: { seat: "bottom", dir: "up" },
  s: { seat: "bottom", dir: "down" },
  a: { seat: "bottom", dir: "left" },
  d: { seat: "bottom", dir: "right" },
  i: { seat: "top", dir: "up" },
  k: { seat: "top", dir: "down" },
  j: { seat: "top", dir: "left" },
  l: { seat: "top", dir: "right" },
};

/**
 * `1` and `2` are player counts, which is all the two modes are. Enter and
 * space keep meaning the obvious thing on a card with buttons on it, and the
 * obvious thing is the game you can play on your own.
 *
 * A bot match has no number of its own — it is one person playing, same as
 * solo — so the third button is a mnemonic rather than a count.
 */
const START: Readonly<Record<string, Mode>> = {
  "1": "solo",
  "2": "duel",
  Enter: "solo",
  " ": "solo",
};

/** Letters only: a held shift must still steer, but `ArrowUp` is not `arrowup`. */
const normalise = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

/**
 * Null for every key the card has no use for — including Tab, which belongs to
 * whoever is navigating with it, on every screen.
 */
export function keyAction(key: string, screen: Screen): KeyAction | null {
  const pressed = normalise(key);

  if (screen === "game") {
    const steer = STEER[pressed];
    if (steer) return { kind: "steer", seat: steer.seat, dir: steer.dir };
    // The countdown and the game-over card are the only things listening, and
    // both of them just want to be got rid of.
    return pressed === "Enter" || pressed === " " || pressed === "Escape"
      ? { kind: "dismiss" }
      : null;
  }

  if (screen === "roster") {
    const picked = PERSONA_IDS[Number(pressed) - 1];
    if (picked) return { kind: "pick", persona: picked };
    // Tapping BOT to see who is in there must not commit you to playing one.
    return pressed === "Escape" ? { kind: "back" } : null;
  }

  const mode = START[pressed];
  if (mode) return { kind: "start", mode };
  return pressed === "b" ? { kind: "roster" } : null;
}
