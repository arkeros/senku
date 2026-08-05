/**
 * The minefield.
 *
 * Everything here is a value in, value out. There is no canvas, no clock and
 * no `Math.random` — the caller injects randomness — so the half of the game
 * that is actually deducible is testable without a browser.
 *
 * Cells are addressed by a flat index, `row * cols + col`. A minefield is
 * walked far more often than it is read out, and a flat array keeps the eight
 * neighbours of a cell an arithmetic step away rather than two lookups.
 */

/** Which side of the table a player is on. Solo always plays `left`. */
export type Side = "left" | "right";

export const SIDES = ["left", "right"] as const;

/**
 * What a tile is showing.
 *
 * `flagged` is a solo guess and `taken` is a duel claim; they are different
 * states because a flag can be wrong and a claim never is — you only take a
 * pepper by turning one over.
 */
export type Tile =
  | { readonly kind: "hidden" }
  | { readonly kind: "revealed" }
  | { readonly kind: "flagged" }
  | { readonly kind: "taken"; readonly by: Side };

const HIDDEN: Tile = { kind: "hidden" };
const REVEALED: Tile = { kind: "revealed" };
const FLAGGED: Tile = { kind: "flagged" };

export interface Field {
  readonly cols: number;
  readonly rows: number;
  /** Where the peppers are. Fixed once the board is laid. */
  readonly hot: readonly boolean[];
  /** Peppers touching each cell, precomputed — every frame reads these. */
  readonly near: readonly number[];
  readonly tiles: readonly Tile[];
}

/** What a call that changed nothing hands back, so callers never branch on it. */
const NOTHING: readonly number[] = [];

export interface Opening {
  readonly field: Field;
  /** Cold cells newly turned face up. Empty when nothing moved. */
  readonly opened: readonly number[];
  /** The pepper that was bitten, if one was. */
  readonly bitten: number | null;
}

/**
 * Build a field from an explicit set of peppers.
 *
 * Separate from `layPeppers` because a board that is *given* its peppers is
 * exactly what a test wants to talk about, and computing `near` is the same
 * work either way.
 */
export function fieldFrom(cols: number, rows: number, hot: readonly boolean[]): Field {
  const near = hot.map((_, i) => countNear(cols, rows, hot, i));
  return { cols, rows, hot, near, tiles: hot.map(() => HIDDEN) };
}

function countNear(
  cols: number,
  rows: number,
  hot: readonly boolean[],
  i: number,
): number {
  let n = 0;
  for (const j of ring(cols, rows, i)) if (hot[j]) n++;
  return n;
}

/** The up-to-eight cells touching `i`, never wrapping around the rim. */
export const neighbours = (field: Field, i: number): number[] =>
  ring(field.cols, field.rows, i);

function ring(cols: number, rows: number, i: number): number[] {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const c = col + dc;
      const r = row + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows) out.push(r * cols + c);
    }
  }
  return out;
}

/**
 * Scatter `peppers` over a fresh board, skipping every cell in `cold`.
 *
 * Cells are drawn out of a bag by index rather than guessed at and retried:
 * on a dense board rejection sampling can spin for a long time, and asking
 * for more peppers than there is room for would never terminate at all —
 * here it simply fills what fits.
 */
export function layPeppers(
  cols: number,
  rows: number,
  peppers: number,
  random: () => number,
  cold: readonly number[] = [],
): Field {
  const held = new Set(cold);
  const bag: number[] = [];
  for (let i = 0; i < cols * rows; i++) if (!held.has(i)) bag.push(i);

  const n = Math.min(peppers, bag.length);
  for (let k = 0; k < n; k++) {
    const span = bag.length - k;
    const j = k + Math.min(span - 1, Math.floor(random() * span));
    const swap = bag[k];
    bag[k] = bag[j];
    bag[j] = swap;
  }

  const hot = new Array<boolean>(cols * rows).fill(false);
  for (let k = 0; k < n; k++) hot[bag[k]] = true;
  return fieldFrom(cols, rows, hot);
}

/**
 * Lay the same peppers again with `i` and everything it touches held cold,
 * so a solo player's first tap always opens a region instead of being a coin
 * toss they can lose before the game has started.
 *
 * Only valid on an untouched board: it hands back a fresh field, so anything
 * already turned over would be buried again.
 *
 * On a board too dense to keep the whole ring cold, only the tapped cell is
 * held — that still costs the player nothing, and it is better than quietly
 * dropping the peppers that would not fit.
 */
export function relayAround(field: Field, i: number, random: () => number): Field {
  const peppers = pepperCount(field);
  const around = [i, ...neighbours(field, i)];
  const room = field.cols * field.rows - around.length;
  return layPeppers(field.cols, field.rows, peppers, random, room >= peppers ? around : [i]);
}

/**
 * Turn a tile over, and everything an empty one opens onto.
 *
 * The flood only steps outward from a cell touching no peppers, so it stops
 * on the ring of numbers around a region — and every cell it steps onto is
 * cold by construction, which is why it can never bite. It also refuses to
 * walk through a flag: a player who marked a cell asked for it to stay shut,
 * even if they were wrong about why.
 */
export function reveal(field: Field, i: number): Opening {
  if (field.tiles[i].kind !== "hidden") return { field, opened: NOTHING, bitten: null };

  const tiles = field.tiles.slice();
  if (field.hot[i]) {
    tiles[i] = REVEALED;
    return { field: { ...field, tiles }, opened: NOTHING, bitten: i };
  }

  const opened: number[] = [];
  const stack = [i];
  while (stack.length > 0) {
    const j = stack.pop() as number;
    if (tiles[j].kind !== "hidden") continue;
    tiles[j] = REVEALED;
    opened.push(j);
    if (field.near[j] === 0) {
      for (const n of neighbours(field, j)) if (tiles[n].kind === "hidden") stack.push(n);
    }
  }
  return { field: { ...field, tiles }, opened, bitten: null };
}

/** Plant or pull a flag. Only a hidden tile can carry one. */
export function toggleFlag(field: Field, i: number): Field {
  const tile = field.tiles[i];
  if (tile.kind !== "hidden" && tile.kind !== "flagged") return field;
  const tiles = field.tiles.slice();
  tiles[i] = tile.kind === "hidden" ? FLAGGED : HIDDEN;
  return { ...field, tiles };
}

/**
 * Open the rest of the ring around a number whose flags already add up.
 *
 * This is what makes a swept board finishable with a thumb rather than a
 * hundred separate taps, and it is deliberately not free: the flags are taken
 * at the player's word, so a flag in the wrong place opens a pepper.
 *
 * Solo only. A duel has no flags to satisfy, and handing a player eight cells
 * for one tap would settle the race on a single lucky number.
 */
export function chord(field: Field, i: number): Opening {
  if (field.tiles[i].kind !== "revealed" || field.near[i] === 0) {
    return { field, opened: NOTHING, bitten: null };
  }
  const around = neighbours(field, i);
  const flags = around.filter((n) => field.tiles[n].kind === "flagged").length;
  if (flags !== field.near[i]) return { field, opened: NOTHING, bitten: null };

  let out = field;
  const opened: number[] = [];
  let bitten: number | null = null;
  for (const n of around) {
    const step = reveal(out, n);
    out = step.field;
    opened.push(...step.opened);
    if (bitten === null) bitten = step.bitten;
  }
  return { field: out, opened, bitten };
}

export interface Pick {
  readonly field: Field;
  readonly opened: readonly number[];
  /** True when the tapped cell was a pepper and is now this player's. */
  readonly got: boolean;
}

/**
 * A duel tap.
 *
 * There is no flagging and no losing: a pepper goes straight onto the plate
 * of whoever turned it up, and anything else opens like a normal reveal. The
 * cost of a miss is the information it hands the other player, which is the
 * whole game.
 */
export function pick(field: Field, i: number, by: Side): Pick {
  if (field.tiles[i].kind !== "hidden") return { field, opened: NOTHING, got: false };
  if (field.hot[i]) {
    const tiles = field.tiles.slice();
    tiles[i] = { kind: "taken", by };
    return { field: { ...field, tiles }, opened: NOTHING, got: true };
  }
  const out = reveal(field, i);
  return { field: out.field, opened: out.opened, got: false };
}

export const pepperCount = (field: Field): number =>
  field.hot.reduce((n, hot) => (hot ? n + 1 : n), 0);

export const flagCount = (field: Field): number =>
  field.tiles.reduce((n, tile) => (tile.kind === "flagged" ? n + 1 : n), 0);

export const takenBy = (field: Field, side: Side): number =>
  field.tiles.reduce((n, tile) => (tile.kind === "taken" && tile.by === side ? n + 1 : n), 0);

/**
 * Every cold cell turned over — which is a solo win. The peppers themselves
 * are left buried on purpose: finding them all is not the job, clearing
 * everything around them is.
 */
export const swept = (field: Field): boolean =>
  field.tiles.every((tile, i) => field.hot[i] || tile.kind === "revealed");
