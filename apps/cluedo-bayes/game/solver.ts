import {
  ALL_CARDS,
  ENVELOPE,
  HAND_SIZES,
  PLAYER_COUNT,
  ROOMS,
  SUSPECTS,
  WEAPONS,
  pickOne,
  shuffled,
  type CardId,
} from "./cards.js";
import { type Knowledge } from "./knowledge.js";

/** One complete assignment of the unlocated cards that fits every known fact. */
export interface World {
  readonly envelope: readonly CardId[];
  /** Only the *unlocated* cards; located ones are in `Solution.knownHands`. */
  readonly hands: readonly CardId[][];
}

export interface Solution {
  readonly accepted: number;
  readonly attempts: number;
  readonly worlds: readonly World[];
  /** Card → probability it is sealed in the envelope. */
  readonly envelopeProb: Map<CardId, number>;
  /** Card → probability per location, indexed by player then `ENVELOPE`. */
  readonly locationProb: Map<CardId, number[]>;
  readonly knownHands: readonly CardId[][];
  readonly topTheory: { cards: CardId[]; p: number } | null;
}

export interface SolveOptions {
  /** Worlds to collect before stopping. More is smoother but slower. */
  target?: number;
  /** Give up after this many draws, so a heavily constrained position ends. */
  maxAttempts?: number;
  random?: () => number;
}

const isRuledOut = (k: Knowledge, player: number, card: CardId) =>
  k.ruledOut.has(`${player}|${card}`);

/**
 * Rejection sampling over the worlds consistent with what one player knows.
 *
 * There is no closed form to reach for. The disjunctions — "that player holds
 * one of these three, but I did not see which" — are clauses, and combining
 * them with the hand-size constraints is a counting problem. Drawing worlds and
 * discarding the inconsistent ones yields calibrated marginals, and the
 * accepted worlds are reusable: the information-gain search scores candidate
 * suggestions against exactly this set rather than re-deriving anything.
 *
 * It samples uniformly over *its own draws*, not uniformly over legal deals.
 * That is good enough for a notepad, and `accepted` / `attempts` are returned
 * so the UI can be honest about how much evidence is behind a number.
 */
export function solve(k: Knowledge, opts: SolveOptions = {}): Solution {
  const { target = 1000, maxAttempts = 25000, random = Math.random } = opts;

  const located = k.located;
  const unknown = ALL_CARDS.filter((c) => !located.has(c));
  const candidates = {
    suspect: SUSPECTS.filter((c) => !located.has(c)),
    weapon: WEAPONS.filter((c) => !located.has(c)),
    room: ROOMS.filter((c) => !located.has(c)),
  };

  // How many more cards each player must still be holding.
  const remaining = HAND_SIZES.map((size, p) => {
    let held = 0;
    located.forEach((holder) => {
      if (holder === p) held++;
    });
    return size - held;
  });

  const knownHands: CardId[][] = Array.from({ length: PLAYER_COUNT }, () => []);
  located.forEach((holder, card) => knownHands[holder].push(card));

  const envelopeHits = new Map<CardId, number>(unknown.map((c) => [c, 0]));
  const locationHits = new Map<CardId, number[]>(
    unknown.map((c) => [c, Array(PLAYER_COUNT + 1).fill(0)]),
  );
  const theoryHits = new Map<string, number>();
  const worlds: World[] = [];
  let accepted = 0;
  let attempts = 0;

  const solvable =
    candidates.suspect.length > 0 && candidates.weapon.length > 0 && candidates.room.length > 0;

  draw: while (solvable && accepted < target && attempts < maxAttempts) {
    attempts++;

    const envelope = [
      pickOne(candidates.suspect, random),
      pickOne(candidates.weapon, random),
      pickOne(candidates.room, random),
    ];

    const sealed = new Set<string>(envelope);
    let pool = unknown.filter((c) => !sealed.has(c));
    const hands: CardId[][] = Array.from({ length: PLAYER_COUNT }, () => []);

    // Deal to the most constrained player first — least slack between what they
    // could hold and what they must. Filling the roomiest hand first would
    // routinely strand the tight one and waste the draw. The shuffle before the
    // sort breaks equal slack at random rather than by player index, which
    // would otherwise bias the marginals toward whoever comes first.
    const order = shuffled([0, 1, 2, 3], random).sort((a, b) => {
      const slackA = pool.filter((c) => !isRuledOut(k, a, c)).length - remaining[a];
      const slackB = pool.filter((c) => !isRuledOut(k, b, c)).length - remaining[b];
      return slackA - slackB;
    });

    for (const p of order) {
      if (remaining[p] <= 0) continue;
      const allowed = shuffled(
        pool.filter((c) => !isRuledOut(k, p, c)),
        random,
      );
      if (allowed.length < remaining[p]) continue draw;
      hands[p] = allowed.slice(0, remaining[p]);
      const taken = new Set<string>(hands[p]);
      pool = pool.filter((c) => !taken.has(c));
    }
    // Every card has to land somewhere.
    if (pool.length > 0) continue;

    for (const clause of k.disjunctions) {
      const satisfied = clause.cards.some(
        (c) => located.get(c) === clause.player || hands[clause.player].includes(c),
      );
      if (!satisfied) continue draw;
    }

    accepted++;
    for (const c of envelope) {
      envelopeHits.set(c, (envelopeHits.get(c) ?? 0) + 1);
      locationHits.get(c)![ENVELOPE]++;
    }
    for (let p = 0; p < PLAYER_COUNT; p++) {
      for (const c of hands[p]) locationHits.get(c)![p]++;
    }
    const key = envelope.join("|");
    theoryHits.set(key, (theoryHits.get(key) ?? 0) + 1);
    worlds.push({ envelope, hands });
  }

  const envelopeProb = new Map<CardId, number>();
  const locationProb = new Map<CardId, number[]>();
  for (const card of ALL_CARDS) {
    const holder = located.get(card);
    if (holder !== undefined) {
      envelopeProb.set(card, 0);
      const certain = Array(PLAYER_COUNT + 1).fill(0);
      certain[holder] = 1;
      locationProb.set(card, certain);
      continue;
    }
    envelopeProb.set(card, accepted ? (envelopeHits.get(card) ?? 0) / accepted : 0);
    const hits = locationHits.get(card)!;
    locationProb.set(
      card,
      accepted ? hits.map((n) => n / accepted) : Array(PLAYER_COUNT + 1).fill(0),
    );
  }

  let best: { cards: CardId[]; p: number } | null = null;
  theoryHits.forEach((n, key) => {
    const p = n / accepted;
    if (!best || p > best.p) best = { cards: key.split("|") as CardId[], p };
  });

  return {
    accepted,
    attempts,
    worlds,
    envelopeProb,
    locationProb,
    knownHands,
    topTheory: best,
  };
}
