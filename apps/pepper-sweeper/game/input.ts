import type { Mode } from "./match";

/**
 * What a press means.
 *
 * Kept out of the component because a long press is the one gesture with no
 * browser event of its own: it has to be timed by hand against a finger that
 * has not moved yet. Out here that timing is a pair of pure functions a test
 * can pin down, rather than two thresholds buried in a `requestAnimationFrame`
 * loop.
 */

/** How long a finger must sit still on a cell before it plants a flag. */
export const HOLD_MS = 350;

/**
 * How far a finger may drift and still be on the same cell. Skin is wider
 * than a pixel and nobody holds a phone perfectly still; without some slack a
 * long press on a bus is a cancelled one.
 */
export const MOVE_SLOP = 14;

export type HoldVerdict = "waiting" | "flag" | "cancelled";

/**
 * What a finger that is still down has decided, checked once a frame.
 *
 * The flag fires under the finger rather than on release, so the player feels
 * the buzz and sees the flag land while still holding — which is the only
 * thing that teaches the gesture to someone who hit it by accident.
 */
export const holdVerdict = (heldMs: number, movedPx: number): HoldVerdict =>
  movedPx > MOVE_SLOP ? "cancelled" : heldMs >= HOLD_MS ? "flag" : "waiting";

/**
 * Whether lifting counts as a tap.
 *
 * False once the press has been held long enough to flag: that flag has
 * already landed, and lifting must not also turn the cell it was planted on.
 */
export const isTap = (heldMs: number, movedPx: number): boolean =>
  movedPx <= MOVE_SLOP && heldMs < HOLD_MS;

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
 * to whoever is navigating with it. Own keys only, so `toString` is a key
 * like any other rather than a function off the prototype.
 */
export const startKey = (key: string): Mode | null =>
  Object.hasOwn(START, key) ? START[key] : null;
