import { PLAYER_COUNT, pickOne, type CardId, type PlayerIndex } from "./cards.js";
import {
  learnDisjunction,
  learnPass,
  learnShown,
  type Knowledge,
} from "./knowledge.js";

/**
 * Resolving a suggestion at the table, and telling everyone what they may
 * legitimately conclude from it.
 *
 * Kept separate from the React component because the interesting rules live
 * here: who answers, which card they choose, and — the part that decides
 * whether the bots are any good — how little that choice can be made to reveal.
 */

export interface Response {
  readonly shower: PlayerIndex | null;
  readonly card: CardId | null;
  /** Players asked before the shower, who held none of the three. */
  readonly passers: readonly PlayerIndex[];
}

/**
 * Which cards each player has already shown to each other player.
 *
 * Keyed `shower->viewer`, because a card is only "safe" to re-show to the
 * person who has already seen it.
 */
export type ShowHistory = Map<string, Set<CardId>>;

export const newShowHistory = (): ShowHistory => new Map();

const historyKey = (shower: number, viewer: number) => `${shower}->${viewer}`;

export function recordShow(
  history: ShowHistory,
  shower: PlayerIndex,
  viewer: PlayerIndex,
  card: CardId,
): void {
  const key = historyKey(shower, viewer);
  let seen = history.get(key);
  if (!seen) {
    seen = new Set();
    history.set(key, seen);
  }
  seen.add(card);
}

/**
 * Ask each player in turn, starting to the suggester's left, until one can
 * disprove the suggestion.
 *
 * When a responder holds several of the three, they re-show one the suggester
 * has already seen if they can. That reveals nothing they had not already given
 * away, and it is why probing a card you have already located is worth roughly
 * zero bits — the information model in `information.ts` assumes exactly this
 * policy, so the two must stay in step.
 */
export function firstResponder(
  hands: readonly (readonly CardId[])[],
  suggester: PlayerIndex,
  suggestion: readonly CardId[],
  history: ShowHistory,
  random: () => number = Math.random,
): Response {
  const passers: PlayerIndex[] = [];

  for (let step = 1; step < PLAYER_COUNT; step++) {
    const r = ((suggester + step) % PLAYER_COUNT) as PlayerIndex;
    const matches = suggestion.filter((c) => hands[r].includes(c));
    if (matches.length === 0) {
      passers.push(r);
      continue;
    }
    const alreadySeen = history.get(historyKey(r, suggester));
    const card = matches.find((c) => alreadySeen?.has(c)) ?? pickOne(matches, random);
    return { shower: r, card, passers };
  }

  return { shower: null, card: null, passers };
}

/**
 * Update every player's notebook from one resolved suggestion.
 *
 * The asymmetry is the whole game: the suggester sees *which* card, while a
 * bystander only learns that the shower holds one of the three. Passers are
 * public information to everybody.
 */
export function broadcast(
  knowledge: readonly Knowledge[],
  suggester: PlayerIndex,
  suggestion: readonly CardId[],
  response: Response,
): void {
  knowledge.forEach((k, p) => {
    for (const passer of response.passers) learnPass(k, passer, suggestion);

    if (response.shower === null || response.card === null) return;
    if (p === suggester) {
      learnShown(k, response.card, response.shower);
    } else if (p !== response.shower) {
      learnDisjunction(k, response.shower, suggestion);
    }
  });
}
