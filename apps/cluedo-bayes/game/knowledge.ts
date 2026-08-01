import { PLAYER_COUNT, type CardId, type PlayerIndex } from "./cards.js";

/**
 * What one player has deduced.
 *
 * Three kinds of fact, in increasing weakness:
 *
 *   located       a card is definitely in a specific hand
 *   ruledOut      a card is definitely *not* in a specific hand
 *   disjunctions  a player holds at least one of three cards, but we did not
 *                 see which — all a bystander learns when someone else is
 *                 shown a card
 *
 * The disjunctions are why a Monte Carlo sampler earns its keep: they are
 * clauses rather than assignments, and chaining them is exactly what a paper
 * grid cannot do.
 */
export interface Disjunction {
  readonly player: PlayerIndex;
  readonly cards: readonly CardId[];
}

export interface Knowledge {
  readonly self: PlayerIndex;
  /** card → whoever holds it. */
  readonly located: Map<CardId, PlayerIndex>;
  /** `${player}|${card}` for every ruled-out pairing. */
  readonly ruledOut: Set<string>;
  readonly disjunctions: Disjunction[];
}

const pairKey = (player: number, card: CardId) => `${player}|${card}`;

export function newKnowledge(self: PlayerIndex, hand: readonly CardId[]): Knowledge {
  const k: Knowledge = {
    self,
    located: new Map(),
    ruledOut: new Set(),
    disjunctions: [],
  };
  for (const card of hand) learnShown(k, card, self);
  return k;
}

export const holderOf = (k: Knowledge, card: CardId): PlayerIndex | undefined =>
  k.located.get(card);

export const knownNotToHold = (k: Knowledge, player: number, card: CardId): boolean =>
  k.ruledOut.has(pairKey(player, card));

/**
 * A card seen in a hand. Locating it rules it out everywhere else.
 *
 * An already-located card is left alone: a second, contradicting claim about
 * the same card can only be noise or a protocol violation, and believing it
 * would corrupt every deduction downstream.
 */
export function learnShown(k: Knowledge, card: CardId, holder: PlayerIndex): void {
  if (k.located.has(card)) return;
  k.located.set(card, holder);
  for (let p = 0; p < PLAYER_COUNT; p++) {
    if (p !== holder) k.ruledOut.add(pairKey(p, card));
  }
}

/** A player who could not disprove a suggestion holds none of its three cards. */
export function learnPass(k: Knowledge, player: number, cards: readonly CardId[]): void {
  for (const card of cards) k.ruledOut.add(pairKey(player, card));
}

/**
 * A player showed *someone else* a card: they hold at least one of the three.
 *
 * Clauses already satisfied by a located card are dropped — they constrain
 * nothing and would only slow the sampler down.
 */
export function learnDisjunction(
  k: Knowledge,
  player: PlayerIndex,
  cards: readonly CardId[],
): void {
  if (cards.some((c) => k.located.get(c) === player)) return;
  k.disjunctions.push({ player, cards: [...cards] });
}
