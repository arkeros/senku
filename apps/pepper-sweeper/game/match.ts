import type { Board, Cut } from "./board";
import type { Side } from "./field";

/**
 * The match state machine: whose go it is, how many peppers each side has,
 * and what ends a game.
 *
 * It also owns the two modes' board shapes and pepper counts, because that is
 * where the duel's one real guarantee has to be written down — see
 * `DUEL_PEPPERS`.
 */

/** Solo is a board to clear; duel is a race for the peppers on it. */
export type Mode = "solo" | "duel";

export type Phase = "play" | "end";

/** How a solo game finished. A duel has a `winner` instead. */
export type Outcome = "swept" | "bitten";

/** Peppers a duel is played to. */
export const PEPPERS_TO_WIN = 5;

/**
 * Peppers on a duel board.
 *
 * The floor is `PEPPERS_TO_WIN * 2 - 1`. Below it the race can end level with
 * nothing left to find — eight peppers split four-all is a match with no
 * winner and no move that would ever produce one. At or above it, one side
 * must reach the target.
 *
 * Twelve sits just over that floor rather than well above it, because the
 * fraction is what gives a duel its shape: five of twelve is nearly half the
 * board's peppers, so the race is fought across the whole griddle. Raise this
 * much further and the match is a sprint that stops while most of the board
 * is still face down.
 */
export const DUEL_PEPPERS = 12;

/** Roughly the density a classic minesweeper board is played at. */
const SOLO_DENSITY = 0.16;

/**
 * What each mode holds constant across screens.
 *
 * Solo is a puzzle the size of the screen, so its cells stay a thumb wide and
 * a bigger screen holds more of them; its pepper count is a density, so the
 * game scales with the board and stays the one people expect.
 *
 * A duel cannot do that. `DUEL_PEPPERS` and `PEPPERS_TO_WIN` are absolute
 * numbers, and a fraction of an absolute number is only meaningful against a
 * fixed board — twelve peppers is a fair minefield on seventy-two cells and a
 * coin toss on thirty. So a duel is a 6x12 board wherever it is played, and
 * what varies is how big the cells come out. Six by twelve is a phone's
 * proportions, which is where this is played and what it therefore fills.
 */
export const CUT: Readonly<Record<Mode, Cut>> = {
  solo: { kind: "fill", cell: 44 },
  duel: { kind: "fit", cols: 6, rows: 12 },
};

/** How many peppers to lay on a board of this size. */
export const peppersFor = (mode: Mode, board: Board): number =>
  mode === "duel" ? DUEL_PEPPERS : Math.round(board.cols * board.rows * SOLO_DENSITY);

export interface Match {
  readonly mode: Mode;
  readonly phase: Phase;
  /** Whose go it is. Meaningless in solo, where it is always `left`. */
  readonly turn: Side;
  /** Peppers on each plate. Solo never touches these. */
  readonly found: Readonly<Record<Side, number>>;
  /** Duel winner; null until someone takes the fifth. */
  readonly winner: Side | null;
  /** Solo ending; null in a duel and until the board is settled. */
  readonly outcome: Outcome | null;
  /** Whether the first tap has happened, so the peppers are relaid only once. */
  readonly touched: boolean;
  /** Frames played, which is the solo clock. */
  readonly frames: number;
}

export const other = (side: Side): Side => (side === "left" ? "right" : "left");

export function newMatch(mode: Mode): Match {
  return {
    mode,
    phase: "play",
    turn: "left",
    found: { left: 0, right: 0 },
    winner: null,
    outcome: null,
    touched: false,
    frames: 0,
  };
}

/** The clock runs while the game does, and stops the moment it is settled. */
export const tick = (match: Match, dt: number): Match =>
  match.phase === "end" ? match : { ...match, frames: match.frames + dt };

export const seconds = (match: Match): number => Math.floor(match.frames / 60);

/**
 * Hand the go across the table. A duel turn ends on a miss, not on a find —
 * turning up a pepper earns another go, which is what lets a good read run.
 */
export const passTurn = (match: Match): Match =>
  match.phase === "end" ? match : { ...match, turn: other(match.turn) };

/** A pepper onto one side's plate, and the match if it was the fifth. */
export function scored(match: Match, side: Side): Match {
  if (match.phase === "end") return match;
  const found = { ...match.found, [side]: match.found[side] + 1 };
  const won = found[side] >= PEPPERS_TO_WIN;
  return { ...match, found, phase: won ? "end" : "play", winner: won ? side : null };
}

/** Settle a solo board. The first ending is the one that counts. */
export const finish = (match: Match, outcome: Outcome): Match =>
  match.phase === "end" ? match : { ...match, phase: "end", outcome };

export const touch = (match: Match): Match =>
  match.touched ? match : { ...match, touched: true };
