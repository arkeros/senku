/**
 * Cutting a viewport into a grid, and finding the cell under a finger.
 *
 * Deliberately ignorant of peppers. A mode says which of the two things about
 * a board it wants held constant across screens, and this works out the other
 * — because they cannot both be held. Either the cells are the same size
 * everywhere and a bigger screen holds more of them, or the board is the same
 * everywhere and its cells grow to suit.
 */

/** What a mode holds constant. */
export type Cut =
  /**
   * A board of fixed dimensions, scaled to whatever it is played on. For a
   * mode whose difficulty is a property of the board rather than of the
   * screen: hold the cell count and the pepper density is held with it.
   */
  | { readonly kind: "fit"; readonly cols: number; readonly rows: number }
  /**
   * As many cells of about `cell` pixels as fit. For a mode that is a puzzle
   * the size of the screen: a phone gets a phone's worth, a desktop window a
   * desktop's, and a thumb-sized target stays thumb-sized on both.
   */
  | { readonly kind: "fill"; readonly cell: number };

export interface Board {
  readonly cols: number;
  readonly rows: number;
  /** Side of one cell, in CSS pixels. */
  readonly cell: number;
  /** Top-left corner of the grid within the viewport. */
  readonly originX: number;
  readonly originY: number;
  /** Space left around the grid. */
  readonly pad: number;
  /** Band held back top and bottom; the score strip is drawn in the lower one. */
  readonly band: number;
}

/**
 * A cell any smaller than this cannot be tapped with a thumb, and a
 * minesweeper board is nothing but small targets pressed at speed.
 */
export const MIN_CELL = 26;

/** Below this the board stops being a puzzle and starts being a coin toss. */
const MIN_EDGE = 5;

/** Cut the viewport into a grid, the way this `cut` asks for. */
export function layout(width: number, height: number, cut: Cut): Board {
  const { pad, band, availW, availH } = margins(width, height);
  const grid = cut.kind === "fit" ? fitted(cut, availW, availH) : filled(cut.cell, availW, availH);
  return place({ ...grid, pad, band }, width, height);
}

/**
 * A board of fixed dimensions, with the biggest cells that fit both ways.
 *
 * Whichever edge binds, the board reaches it — so on a phone it fills at
 * least one axis and usually both. On a screen shaped nothing like the board
 * the leftover shows on the other axis, which is the honest price of the
 * board being the same board there as everywhere else.
 */
function fitted(cut: { cols: number; rows: number }, availW: number, availH: number) {
  const cell = Math.max(MIN_CELL, Math.floor(Math.min(availW / cut.cols, availH / cut.rows)));
  return { cols: cut.cols, rows: cut.rows, cell };
}

/**
 * As many cells of about `target` pixels as fit.
 *
 * The column count is rounded to the nearest whole board and the cell size
 * then taken from *that*, rather than the other way round: cells a couple of
 * pixels off the target are invisible, while a strip of unused screen down
 * one side is not.
 */
function filled(target: number, availW: number, availH: number) {
  const guess = Math.max(MIN_EDGE, Math.round(availW / target));
  const cell = Math.max(MIN_CELL, Math.floor(availW / guess));
  return {
    cols: Math.max(MIN_EDGE, Math.floor(availW / cell)),
    rows: Math.max(MIN_EDGE, Math.floor(availH / cell)),
    cell,
  };
}

/**
 * Re-fit a board that is already in play to a new viewport size.
 *
 * A phone shifts under a running game more often than it looks — the URL bar
 * collapses on the first tap. Re-running `layout` would hand back a different
 * number of rows, and every cell of a half-swept board would suddenly mean
 * somewhere else. So the grid keeps its dimensions and only the pixels move.
 */
export function refit(board: Board, width: number, height: number): Board {
  const { pad, band, availW, availH } = margins(width, height);
  const cell = Math.max(6, Math.floor(Math.min(availW / board.cols, availH / board.rows)));
  return place({ cols: board.cols, rows: board.rows, cell, pad, band }, width, height);
}

/**
 * Padding, the score bands, and what is left for the grid.
 *
 * Both are whole pixels so that `place`'s rounding can never push the grid
 * back into a band it was measured to clear.
 */
function margins(width: number, height: number) {
  const short = Math.min(width, height);
  const pad = Math.max(10, Math.round(short * 0.045));
  const band = Math.max(34, Math.round(short * 0.11));
  return { pad, band, availW: width - pad * 2, availH: height - (pad + band) * 2 };
}

/** Centre a grid of known size in the viewport. */
function place(
  grid: { cols: number; rows: number; cell: number; pad: number; band: number },
  width: number,
  height: number,
): Board {
  return {
    ...grid,
    originX: Math.round((width - grid.cols * grid.cell) / 2),
    originY: Math.round((height - grid.rows * grid.cell) / 2),
  };
}

/** Viewport pixel at the middle of a cell. */
export function centerOf(board: Board, col: number, row: number): { x: number; y: number } {
  return {
    x: board.originX + (col + 0.5) * board.cell,
    y: board.originY + (row + 0.5) * board.cell,
  };
}

/** Which cell that pixel is on, or null for a tap beside the board. */
export function cellAt(
  board: Board,
  x: number,
  y: number,
): { col: number; row: number } | null {
  const col = Math.floor((x - board.originX) / board.cell);
  const row = Math.floor((y - board.originY) / board.cell);
  const on = col >= 0 && col < board.cols && row >= 0 && row < board.rows;
  return on ? { col, row } : null;
}
