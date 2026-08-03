import type { Dir, Mode, Seat } from "./rules";

/**
 * Turning fingers on glass into headings.
 *
 * Separate from `rules` because none of this is about the plate: it is about
 * where a hand is and which way round its owner is sitting. Kept pure so the
 * awkward half — the far player's flicks — can be tested without a DOM.
 */

/** Travel, in CSS pixels, before a drag counts as a flick rather than a tap. */
export const MIN_SWIPE = 24;

/**
 * Which way that flick pointed, from the flicking player's side of the table.
 *
 * The `top` seat is reading the same screen upside down: their hand pushing
 * away from their body travels *down* the glass, and their strand — drawn
 * heading down the screen — is going forward. So their gesture is rotated
 * half a turn before it is read, and both players get a plain "flick the way
 * you want to go".
 *
 * Returns null for anything too short to be a deliberate flick, which is what
 * lets the same handler serve taps.
 */
export function swipeDir(
  dx: number,
  dy: number,
  seat: Seat,
  minDistance: number = MIN_SWIPE,
): Dir | null {
  const x = seat === "top" ? -dx : dx;
  const y = seat === "top" ? -dy : dy;
  if (Math.max(Math.abs(x), Math.abs(y)) < minDistance) return null;
  // Ties go to the vertical, which is arbitrary but has to be decided
  // somewhere — a diagonal flick must always mean the same thing.
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}

/**
 * Whose hand that is. A duel splits the glass across the middle; solo hands
 * every touch to the only player, so they can flick wherever is comfortable.
 */
export const seatAt = (y: number, height: number, mode: Mode): Seat =>
  mode === "solo" ? "bottom" : y < height / 2 ? "top" : "bottom";
