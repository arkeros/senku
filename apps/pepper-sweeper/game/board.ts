/**
 * Cutting a viewport into a grid, and finding the cell under a finger.
 *
 * Deliberately ignorant of peppers: a mode says how coarsely it wants the
 * screen cut and this hands back a grid that fills it. One number is the
 * whole interface, because how big a cell should be is the only thing about
 * a board the rules have an opinion on.
 */

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

/**
 * Cut the viewport into a grid that fills it.
 *
 * Cell size comes off the *shorter* available edge, so a board is about
 * `cellsAcross` cells wide on any phone and a number stays the same size
 * relative to a thumb. The long edge then takes as many rows as fit, which is
 * what a mode is really choosing between when it picks a coarser cut: fewer,
 * bigger cells all the way down the screen, rather than a smaller board.
 */
export function layout(width: number, height: number, cellsAcross: number): Board {
  const { pad, band, availW, availH } = margins(width, height);
  const cell = Math.max(MIN_CELL, Math.floor(Math.min(availW, availH) / cellsAcross));
  return place(
    {
      cols: Math.max(MIN_EDGE, Math.floor(availW / cell)),
      rows: Math.max(MIN_EDGE, Math.floor(availH / cell)),
      cell,
      pad,
      band,
    },
    width,
    height,
  );
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
