export type Player = "blue" | "red";

export interface Mark {
  readonly player: Player;
  readonly value: number;
}

/** A napkin: `size * size` cells, `null` where nothing has been written yet. */
export type Board = readonly (Mark | null)[];

export type Hands = Readonly<Record<Player, readonly number[]>>;

export type Score = Record<Player, number>;

export interface Mode {
  /** Cells per side. */
  readonly size: number;
  /** Each player holds `1..tiles`, one use each. */
  readonly tiles: number;
}

/**
 * `classic` leaves one cell empty at the end (16 cells − 1 stain − 14 tiles),
 * so the last decision is *which* hole to leave. `lightning` fills the napkin
 * exactly and is over in eight moves.
 */
export const MODES = {
  classic: { size: 4, tiles: 7 },
  lightning: { size: 3, tiles: 4 },
} as const satisfies Record<string, Mode>;

export type ModeName = keyof typeof MODES;

export function opponent(player: Player): Player {
  return player === "blue" ? "red" : "blue";
}

/** Orthogonal neighbors of `index`, in ascending order. Rows do not wrap. */
export function neighbors(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const found: number[] = [];
  if (row > 0) found.push(index - size);
  if (col > 0) found.push(index - 1);
  if (col < size - 1) found.push(index + 1);
  if (row < size - 1) found.push(index + size);
  return found;
}

/**
 * One point per adjacent rival pair, to whichever number is higher. Equal
 * numbers cancel; same-player neighbors never fight.
 */
export function score(board: Board, size: number): Score {
  const points: Score = { blue: 0, red: 0 };
  for (let i = 0; i < board.length; i++) {
    const here = board[i];
    if (!here) continue;
    for (const j of neighbors(i, size)) {
      // Ascending-only so each pair is judged once rather than from both ends.
      if (j < i) continue;
      const there = board[j];
      if (!there || there.player === here.player) continue;
      if (here.value > there.value) points[here.player]++;
      else if (there.value > here.value) points[there.player]++;
    }
  }
  return points;
}

/** The seven non-identity symmetries of a square, as (row, col) maps. */
const SYMMETRIES: readonly ((
  row: number,
  col: number,
  size: number,
) => readonly [number, number])[] = [
  (row, col, size) => [col, size - 1 - row], // quarter turn
  (row, col, size) => [size - 1 - row, size - 1 - col], // half turn
  (row, col, size) => [size - 1 - col, row], // three-quarter turn
  (row, col, size) => [row, size - 1 - col], // flip across the vertical
  (row, col, size) => [size - 1 - row, col], // flip across the horizontal
  (row, col) => [col, row], // flip across the main diagonal
  (row, col, size) => [size - 1 - col, size - 1 - row], // flip across the anti-diagonal
];

/**
 * Where the coffee stain may land.
 *
 * A bare napkin is a guaranteed draw: the second player answers every move
 * with the same number on the cell opposite under some symmetry, and the
 * points cancel pair by pair. That copying only survives if the stain leaves
 * the remaining cells perfectly pairable — which happens exactly when the
 * stain sits on the *only* cell a symmetry holds still. Everywhere else, one
 * cell is left without a partner and the copy breaks.
 *
 * In practice that rules out the middle of an odd board and nothing else; the
 * check is written against the symmetry group rather than hardcoded so it
 * stays honest for board sizes we have not tried.
 */
export function stainCandidates(size: number): number[] {
  const unsafe = new Set<number>();
  for (const symmetry of SYMMETRIES) {
    const held: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const row = Math.floor(i / size);
      const col = i % size;
      const [movedRow, movedCol] = symmetry(row, col, size);
      if (movedRow === row && movedCol === col) held.push(i);
    }
    if (held.length === 1) unsafe.add(held[0]);
  }
  return Array.from({ length: size * size }, (_unused, i) => i).filter(
    (i) => !unsafe.has(i),
  );
}

export function isFinished({
  board,
  hands,
  stain,
}: {
  board: Board;
  hands: Hands;
  stain: number;
}): boolean {
  if (hands.blue.length === 0 && hands.red.length === 0) return true;
  return board.every((cell, i) => cell !== null || i === stain);
}

export interface Move {
  readonly index: number;
  readonly player: Player;
  readonly value: number;
}

export interface Game {
  readonly mode: ModeName;
  readonly size: number;
  readonly board: Board;
  readonly hands: Hands;
  /** Index of the coffee stain — see {@link stainCandidates}. */
  readonly stain: number;
  readonly turn: Player;
  readonly history: readonly Move[];
}

export function startGame(mode: ModeName, stain: number): Game {
  const { size, tiles } = MODES[mode];
  const hand = Array.from({ length: tiles }, (_unused, i) => i + 1);
  return {
    mode,
    size,
    board: Array.from({ length: size * size }, () => null),
    hands: { blue: hand, red: hand },
    stain,
    turn: "blue",
    history: [],
  };
}

/**
 * Write `value` into cell `index` for whoever's turn it is.
 *
 * Illegal moves return the game unchanged rather than throwing: the UI offers
 * them (a mistimed tap, a double-click) and the right answer is to ignore
 * them, not to crash the napkin.
 */
export function play(game: Game, index: number, value: number): Game {
  const player = game.turn;
  const legal =
    index !== game.stain &&
    game.board[index] === null &&
    game.hands[player].includes(value) &&
    !isFinished(game);
  if (!legal) return game;

  const board = [...game.board];
  board[index] = { player, value };
  return {
    ...game,
    board,
    hands: {
      ...game.hands,
      [player]: game.hands[player].filter((tile) => tile !== value),
    },
    turn: opponent(player),
    history: [...game.history, { index, player, value }],
  };
}

export function undo(game: Game): Game {
  const last = game.history[game.history.length - 1];
  if (!last) return game;

  const board = [...game.board];
  board[last.index] = null;
  return {
    ...game,
    board,
    hands: {
      ...game.hands,
      [last.player]: [...game.hands[last.player], last.value].sort(
        (a, b) => a - b,
      ),
    },
    turn: last.player,
    history: game.history.slice(0, -1),
  };
}
