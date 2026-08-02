import { ROOMS, SUSPECTS, WEAPONS, type CardId, type PlayerIndex } from "./cards.js";
import type { Solution, World } from "./solver.js";

/**
 * Scoring suggestions by how much they are expected to teach you.
 *
 * A suggestion is an experiment. Its outcome — who disproves you, and with
 * which card — partitions the worlds you currently believe possible. The
 * expected information gain is the prior entropy of the envelope minus the
 * probability-weighted entropy of each outcome's surviving worlds, which is
 * exactly the mutual information between the answer and the solution.
 *
 * The point of measuring it: the intuitive move (asking about cards you are
 * unsure of) is often worth less than a move that pins one category by
 * including a card nobody can block.
 */

/** Shannon entropy, in bits, of a distribution given as unnormalised counts. */
export function entropyOf(counts: ReadonlyMap<string, number>, total: number): number {
  if (total <= 0) return 0;
  let h = 0;
  counts.forEach((weight) => {
    const p = weight / total;
    if (p > 0) h -= p * Math.log2(p);
  });
  return h;
}

const theoryKey = (world: World) => world.envelope.join("|");

/** How uncertain the envelope is across a set of sampled worlds. */
export function envelopeEntropy(worlds: readonly World[]): number {
  const counts = new Map<string, number>();
  for (const w of worlds) {
    const key = theoryKey(w);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entropyOf(counts, worlds.length);
}

/**
 * Sampling cap for the gain search. Scoring every candidate against every world
 * is quadratic in a hot loop on the main thread, and a few hundred worlds
 * already rank candidates stably. Deliberately explicit rather than hidden: the
 * UI reports how many worlds a number came from.
 */
export const GAIN_SAMPLE_CAP = 450;

/** Below this, the estimate is noise and is reported as zero rather than guessed. */
const MIN_WORLDS = 20;

type GainInput = Pick<Solution, "worlds" | "knownHands">;

/**
 * Expected bits a suggestion yields, from the suggester's seat.
 *
 * Outcomes are "responder r showed card c" (the suggester sees which) or
 * "nobody could". Order matters: only the first responder able to disprove
 * does so.
 *
 * The responder policy modelled here matches the one the game actually plays —
 * show a card the suggester already knows you hold whenever possible, since it
 * leaks nothing, and otherwise choose uniformly. Modelling it as always-uniform
 * would overstate the value of asking about cards you have already located.
 */
export function expectedGain(
  sol: GainInput,
  suggester: PlayerIndex,
  suggestion: readonly CardId[],
): number {
  const worlds =
    sol.worlds.length > GAIN_SAMPLE_CAP ? sol.worlds.slice(0, GAIN_SAMPLE_CAP) : sol.worlds;
  if (worlds.length < MIN_WORLDS) return 0;

  const responders = [1, 2, 3].map((step) => (suggester + step) % 4);
  const prior = envelopeEntropy(worlds);

  // outcome → { weight, distribution over surviving theories }
  const outcomes = new Map<string, { weight: number; counts: Map<string, number> }>();
  const record = (outcome: string, theory: string, weight: number) => {
    let bucket = outcomes.get(outcome);
    if (!bucket) {
      bucket = { weight: 0, counts: new Map() };
      outcomes.set(outcome, bucket);
    }
    bucket.weight += weight;
    bucket.counts.set(theory, (bucket.counts.get(theory) ?? 0) + weight);
  };

  for (const world of worlds) {
    const theory = theoryKey(world);
    let disproved = false;

    for (const r of responders) {
      const matches = suggestion.filter(
        (c) => sol.knownHands[r].includes(c) || world.hands[r].includes(c),
      );
      if (matches.length === 0) continue;

      const alreadyKnown = matches.find((m) => sol.knownHands[r].includes(m));
      if (alreadyKnown) {
        // Deterministic, and tells the suggester nothing new.
        record(`${r}>${alreadyKnown}`, theory, 1);
      } else {
        const share = 1 / matches.length;
        for (const m of matches) record(`${r}>${m}`, theory, share);
      }
      disproved = true;
      break;
    }

    if (!disproved) record("none", theory, 1);
  }

  let posterior = 0;
  outcomes.forEach((bucket) => {
    posterior += (bucket.weight / worlds.length) * entropyOf(bucket.counts, bucket.weight);
  });

  return Math.max(0, prior - posterior);
}

/**
 * Candidates worth scoring.
 *
 * Per category: the cards whose envelope probability is least settled (p(1−p)
 * is largest), plus two kinds of probe nobody can block — a card from the
 * suggester's own hand, and a card already deduced to be in the envelope.
 * Including an unblockable card forces the response to carry information about
 * the *other* two categories, which is how a solved category stops wasting a
 * turn.
 */
function candidatesFor(
  sol: Solution,
  suggester: PlayerIndex,
  list: readonly CardId[],
): CardId[] {
  const ranked = list
    .map((c) => {
      const p = sol.envelopeProb.get(c) ?? 0;
      return { card: c, doubt: p * (1 - p) };
    })
    .sort((a, b) => b.doubt - a.doubt);

  const out = ranked.filter((x) => x.doubt > 0).slice(0, 3).map((x) => x.card);

  const own = list.find((c) => sol.knownHands[suggester].includes(c));
  if (own && !out.includes(own)) out.push(own);

  const settled = list.find((c) => (sol.envelopeProb.get(c) ?? 0) >= 0.995);
  if (settled && !out.includes(settled)) out.push(settled);

  if (out.length === 0 && ranked.length > 0) out.push(ranked[0].card);
  return out;
}

export interface ScoredSuggestion {
  readonly suggestion: readonly [CardId, CardId, CardId];
  readonly bits: number;
}

export function bestSuggestion(
  sol: Solution,
  suggester: PlayerIndex,
): ScoredSuggestion | null {
  const suspects = candidatesFor(sol, suggester, SUSPECTS);
  const weapons = candidatesFor(sol, suggester, WEAPONS);
  const rooms = candidatesFor(sol, suggester, ROOMS);

  let best: ScoredSuggestion | null = null;
  for (const s of suspects) {
    for (const w of weapons) {
      for (const r of rooms) {
        const suggestion = [s, w, r] as const;
        const bits = expectedGain(sol, suggester, suggestion);
        if (!best || bits > best.bits) best = { suggestion, bits };
      }
    }
  }
  return best;
}
