import type { Dir, Mode, Seat } from "./rules";

/**
 * Turning fingers on glass into headings.
 *
 * Separate from `rules` because none of this is about the plate: it is about
 * where a hand is, and which of the two hands it is. Kept pure so it can be
 * tested without a DOM.
 */

/** Travel, in CSS pixels, before a drag counts as a flick rather than a tap. */
export const MIN_SWIPE = 24;

/**
 * Which way that flick pointed, across the glass.
 *
 * Deliberately blind to the seat. The far player reads the screen upside
 * down, but their finger and their strand are on the same pane, and `Dir` is
 * spent by `advance` in screen space for either seat — so rotating their
 * gesture half a turn would send the strand away from the finger dragging it.
 * Both players get direct manipulation instead: the strand goes where the
 * finger went.
 *
 * Returns null for anything too short to be a deliberate flick, which is what
 * lets the same handler serve taps.
 */
export function swipeDir(dx: number, dy: number, minDistance: number = MIN_SWIPE): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return null;
  // Ties go to the vertical, which is arbitrary but has to be decided
  // somewhere — a diagonal flick must always mean the same thing.
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

/**
 * Whose hand that is.
 *
 * The glass is split across the middle only when there are two people to split
 * it between. Solo hands every touch to the only player, and so does a duel
 * against a bot — the far strand has a controller, but it does not have
 * thumbs, and halving the glass for it would take away two-thirds of the
 * places the one real player can comfortably flick.
 *
 * `botted` rather than a third mode because `Mode` counts strands and this
 * counts people; see ADR 0001.
 */
export const seatAt = (y: number, height: number, mode: Mode, botted = false): Seat =>
  mode === "solo" || botted ? "bottom" : y < height / 2 ? "top" : "bottom";
