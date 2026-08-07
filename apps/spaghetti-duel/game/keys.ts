import type { Dir, Mode, Seat } from "./rules";

/**
 * What a key press means.
 *
 * Sibling of `swipe`, and separate for the same reason: this is about the
 * hands, not the plate. Out of the component because the keyboard is the one
 * input a test can state exhaustively — while it lived inside the canvas
 * effect, the far seat had steering keys but no way to start the duel it
 * needed, and nothing said so.
 */

/** Steer a strand, or choose a mode from the title card. */
export type KeyAction =
  | { readonly kind: "steer"; readonly seat: Seat; readonly dir: Dir }
  | { readonly kind: "start"; readonly mode: Mode };

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
 */
const START: Readonly<Record<string, Mode>> = {
  "1": "solo",
  "2": "duel",
  Enter: "solo",
  " ": "solo",
};

/**
 * Null for every key the game has no use for — including Tab, which belongs
 * to whoever is navigating with it.
 */
export function keyAction(key: string): KeyAction | null {
  // Letters only: a held shift must still steer, but `ArrowUp` is not `arrowup`.
  const pressed = key.length === 1 ? key.toLowerCase() : key;
  const steer = STEER[pressed];
  if (steer) return { kind: "steer", seat: steer.seat, dir: steer.dir };
  const mode = START[pressed];
  return mode ? { kind: "start", mode } : null;
}
