/**
 * The deck and the deal.
 *
 * Cards are opaque ids rather than display strings. The MF2 catalogs own the
 * names, which is what lets one rulebook serve three locales — and it means a
 * typo in a name can never change a deduction.
 */

export const SUSPECTS = [
  "scarlett",
  "mustard",
  "plum",
  "green",
  "peacock",
  "orchid",
] as const;

export const WEAPONS = [
  "rope",
  "candlestick",
  "revolver",
  "knife",
  "wrench",
  "leadPipe",
] as const;

export const ROOMS = [
  "kitchen",
  "ballroom",
  "conservatory",
  "diningRoom",
  "library",
  "lounge",
  "hall",
  "study",
  "billiardRoom",
] as const;

export type SuspectId = (typeof SUSPECTS)[number];
export type WeaponId = (typeof WEAPONS)[number];
export type RoomId = (typeof ROOMS)[number];
export type CardId = SuspectId | WeaponId | RoomId;

export type Category = "suspect" | "weapon" | "room";

export const ALL_CARDS: readonly CardId[] = [...SUSPECTS, ...WEAPONS, ...ROOMS];

export const PLAYER_COUNT = 4;

/** 21 cards, 3 sealed, 18 dealt as evenly as four hands allow. */
export const HAND_SIZES = [5, 5, 4, 4] as const;

export type PlayerIndex = 0 | 1 | 2 | 3;

/**
 * Location index for the envelope, one past the last player, so a card's
 * whereabouts is a single number across both.
 */
export const ENVELOPE = PLAYER_COUNT;

const SUSPECT_SET: ReadonlySet<string> = new Set(SUSPECTS);
const WEAPON_SET: ReadonlySet<string> = new Set(WEAPONS);

export function categoryOf(card: CardId): Category {
  if (SUSPECT_SET.has(card)) return "suspect";
  if (WEAPON_SET.has(card)) return "weapon";
  return "room";
}

/** Fisher–Yates against an injected source, so a deal can be reproduced. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `Math.min` guards the case a supplied source returns exactly 1, which would
 * otherwise index one past the end.
 */
export const pickOne = <T,>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export interface Deal {
  /** One suspect, one weapon, one room — the solution. */
  readonly envelope: readonly [SuspectId, WeaponId, RoomId];
  readonly hands: readonly CardId[][];
}

export function deal(random: () => number): Deal {
  const envelope = [
    pickOne(SUSPECTS, random),
    pickOne(WEAPONS, random),
    pickOne(ROOMS, random),
  ] as const;

  const sealed = new Set<string>(envelope);
  const rest = shuffled(
    ALL_CARDS.filter((c) => !sealed.has(c)),
    random,
  );

  const hands: CardId[][] = [];
  let at = 0;
  for (const size of HAND_SIZES) {
    hands.push(rest.slice(at, at + size));
    at += size;
  }
  return { envelope, hands };
}
