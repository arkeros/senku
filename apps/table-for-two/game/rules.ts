/** The two sides of the phone. `top` is rendered upside-down. */
export type Seat = "top" | "bottom";

export type ColourName = "red" | "blue" | "green" | "yellow";
export type Parity = "even" | "odd";

export const COLOURS: readonly ColourName[] = ["red", "blue", "green", "yellow"];

export const TARGET_POINTS = 5;

export const REFLEX_DELAY_MS = { min: 1400, max: 4200 } as const;

export type Challenge =
  | { readonly kind: "reflex"; readonly delayMs: number }
  | {
      readonly kind: "arithmetic";
      readonly a: number;
      readonly b: number;
      readonly op: "+" | "−";
      readonly answer: number;
      readonly decoy: number;
      readonly answerFirst: boolean;
    }
  | {
      readonly kind: "stroop";
      readonly wordColour: ColourName;
      readonly inkColour: ColourName;
      readonly answer: ColourName;
      readonly decoy: ColourName;
      readonly answerFirst: boolean;
    }
  | {
      readonly kind: "parity";
      readonly value: number;
      readonly answer: Parity;
      readonly decoy: Parity;
      readonly answerFirst: boolean;
    }
  | {
      readonly kind: "bigger";
      readonly options: readonly [number, number];
      readonly answer: number;
    };

export type Quiz = Exclude<Challenge, { kind: "reflex" }>;

export interface Outcome {
  readonly scorer: Seat;
  /** Why the other player lost the round; drives their stamp. */
  readonly loserReason: "tooSlow" | "wrongAnswer" | "jumpedEarly";
}

export interface Match {
  readonly scores: Readonly<Record<Seat, number>>;
  readonly round: number;
  readonly winner: Seat | null;
}

export const opponent = (seat: Seat): Seat => (seat === "top" ? "bottom" : "top");

// --- generation --------------------------------------------------------------

const intBetween = (random: () => number, lo: number, hi: number) =>
  lo + Math.floor(random() * (hi - lo + 1));

const oneOf = <T,>(random: () => number, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

const KINDS = ["reflex", "arithmetic", "arithmetic", "stroop", "parity", "bigger"] as const;

/**
 * Build the next challenge.
 *
 * Deliberately language-neutral: it yields numbers and enum members, never
 * display strings. Colour names and "even"/"odd" are words that have to be
 * translated, so the route component turns these into text. The prototype
 * baked Spanish in here, which made the whole generator untranslatable.
 *
 * Randomness is injected so every invariant below is testable.
 */
export function challenge(random: () => number): Challenge {
  const kind = oneOf(random, KINDS);

  if (kind === "reflex") {
    return {
      kind,
      delayMs: intBetween(random, REFLEX_DELAY_MS.min, REFLEX_DELAY_MS.max),
    };
  }

  if (kind === "arithmetic") {
    const op = random() < 0.5 ? "+" : "−";
    let a = intBetween(random, 11, 49);
    let b = intBetween(random, 3, 19);
    // Keep subtraction friendly for mental arithmetic across a table.
    if (op === "−" && b > a) [a, b] = [b, a];
    const answer = op === "+" ? a + b : a - b;
    const drift = oneOf(random, [-3, -2, -1, 1, 2, 3]);
    return { kind, a, b, op, answer, decoy: answer + drift, answerFirst: random() < 0.5 };
  }

  if (kind === "stroop") {
    const wordColour = oneOf(random, COLOURS);
    const others = COLOURS.filter((c) => c !== wordColour);
    const inkColour = oneOf(random, others);
    // The answer is the ink; the written word is the decoy. That is the trick.
    return {
      kind,
      wordColour,
      inkColour,
      answer: inkColour,
      decoy: wordColour,
      answerFirst: random() < 0.5,
    };
  }

  if (kind === "parity") {
    const value = intBetween(random, 12, 98);
    const answer: Parity = value % 2 === 0 ? "even" : "odd";
    return {
      kind,
      value,
      answer,
      decoy: answer === "even" ? "odd" : "even",
      answerFirst: random() < 0.5,
    };
  }

  const x = intBetween(random, 21, 89);
  const y = x + oneOf(random, [-4, -3, -2, 2, 3, 4]);
  const options: readonly [number, number] = random() < 0.5 ? [x, y] : [y, x];
  return { kind: "bigger", options, answer: Math.max(x, y) };
}

/**
 * The two tappable answers, in display order.
 *
 * Returned as the challenge's own value type (numbers stay numbers) so the
 * caller compares against `answer` without stringifying first.
 */
export function quizOptions(quiz: Quiz): readonly [unknown, unknown] {
  if (quiz.kind === "bigger") return quiz.options;
  return quiz.answerFirst ? [quiz.answer, quiz.decoy] : [quiz.decoy, quiz.answer];
}

// --- judging -----------------------------------------------------------------

/** A right answer scores; a wrong one hands the point to the other side. */
export function judgeQuiz(seat: Seat, chosen: unknown, quiz: Quiz): Outcome {
  return chosen === quiz.answer
    ? { scorer: seat, loserReason: "tooSlow" }
    : { scorer: opponent(seat), loserReason: "wrongAnswer" };
}

/** Tapping before the green is a false start and gifts the point. */
export function judgeReflex(seat: Seat, greenShown: boolean): Outcome {
  return greenShown
    ? { scorer: seat, loserReason: "tooSlow" }
    : { scorer: opponent(seat), loserReason: "jumpedEarly" };
}

// --- match -------------------------------------------------------------------

export function newMatch(): Match {
  return { scores: { top: 0, bottom: 0 }, round: 1, winner: null };
}

export function award(match: Match, seat: Seat): Match {
  if (match.winner) return match;

  const scores = { ...match.scores, [seat]: match.scores[seat] + 1 };
  const won = scores[seat] >= TARGET_POINTS;
  return {
    scores,
    // The round counter stops on the winning point — there is no next round.
    round: won ? match.round : match.round + 1,
    winner: won ? seat : null,
  };
}
