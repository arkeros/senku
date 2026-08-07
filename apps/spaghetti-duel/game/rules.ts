/**
 * Spaghetti Duel's rulebook.
 *
 * Everything here is a value in, value out. There is no canvas, no clock and
 * no `Math.random` — the caller injects randomness — so the interesting half
 * of the game (does it grow, does it crash, who took the round) is testable
 * without a browser.
 */

/** Solo is one strand chasing a high score; duel is two, best of five. */
export type Mode = "solo" | "duel";

/** Which end of the table a player sits at. Solo always plays `bottom`. */
export type Seat = "bottom" | "top";

export const SEATS = ["bottom", "top"] as const;

export type Dir = "up" | "down" | "left" | "right";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface Board {
  readonly cols: number;
  readonly rows: number;
  /** Side of one cell, in CSS pixels. */
  readonly cell: number;
  /** Top-left corner of the grid within the viewport. */
  readonly originX: number;
  readonly originY: number;
  /** Space left around the grid; the score cards are drawn in it. */
  readonly pad: number;
}

/** How many cells the shorter edge of the plate is cut into. */
export const SHORT_EDGE_CELLS = 16;

/** Below this a cell is too small to read a meatball on, let alone aim at. */
const MIN_CELL = 12;

/** Rounds a duel is played to. */
export const ROUNDS_TO_WIN = 3;

/** Segments a strand starts with. */
export const START_LENGTH = 3;

/** Meatballs on the plate at once. */
const MEATBALLS = 1;

/** Turns a player may bank while waiting for the next move. */
const MAX_QUEUED = 2;

const evenDown = (n: number) => n - (n % 2);

/**
 * Cut the viewport into a grid.
 *
 * Cell size comes off the *shorter* edge so a strand crosses the narrow way
 * in about the same number of moves on any phone, and the grid is centred so
 * the leftover margin splits evenly between the two seats.
 *
 * A band is held back top and bottom for the score cards — the two ends of
 * the table are the only place a duel can put them, since a card anywhere
 * else is upside down for one of the players. `originY` is that band.
 *
 * Both dimensions are forced even. That is what lets `newSnake` place the two
 * seats as exact 180° rotations of one another — on an odd grid one player
 * would start a half-cell closer to the middle than the other.
 */
export function layout(width: number, height: number): Board {
  const { pad, availW, availH } = margins(width, height);
  const cell = Math.max(MIN_CELL, Math.floor(Math.min(availW, availH) / SHORT_EDGE_CELLS));
  const cols = Math.max(8, evenDown(Math.floor(availW / cell)));
  const rows = Math.max(8, evenDown(Math.floor(availH / cell)));
  return place({ cols, rows, cell, pad }, width, height);
}

/**
 * Re-fit a grid that is already in play to a new viewport size.
 *
 * A phone shifts under a running game more often than it looks: the URL bar
 * collapses on the first touch, the on-screen keyboard never appears but the
 * visual viewport still jitters. Re-running `layout` would hand back a
 * different number of rows, and every cell a strand is lying on would mean
 * somewhere else. So the grid keeps its dimensions and only the pixels move —
 * the round survives, slightly smaller.
 */
export function refit(board: Board, width: number, height: number): Board {
  const { pad, availW, availH } = margins(width, height);
  const cell = Math.max(4, Math.floor(Math.min(availW / board.cols, availH / board.rows)));
  return place({ cols: board.cols, rows: board.rows, cell, pad }, width, height);
}

/** Padding, and the space left for the grid once the score bands are held back. */
function margins(width: number, height: number) {
  const short = Math.min(width, height);
  const pad = Math.max(10, short * 0.045);
  const band = Math.max(20, short * 0.07);
  return { pad, availW: width - pad * 2, availH: height - (pad + band) * 2 };
}

/** Centre a grid of known size in the viewport. */
function place(
  grid: { cols: number; rows: number; cell: number; pad: number },
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
export function centerOf(board: Board, cell: Cell): { x: number; y: number } {
  return {
    x: board.originX + (cell.col + 0.5) * board.cell,
    y: board.originY + (cell.row + 0.5) * board.cell,
  };
}

export const opposite = (dir: Dir): Dir =>
  dir === "up" ? "down" : dir === "down" ? "up" : dir === "left" ? "right" : "left";

export function advance(cell: Cell, dir: Dir): Cell {
  switch (dir) {
    case "up":
      return { col: cell.col, row: cell.row - 1 };
    case "down":
      return { col: cell.col, row: cell.row + 1 };
    case "left":
      return { col: cell.col - 1, row: cell.row };
    case "right":
      return { col: cell.col + 1, row: cell.row };
  }
}

export const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

export const inBounds = (board: Board, cell: Cell) =>
  cell.col >= 0 && cell.col < board.cols && cell.row >= 0 && cell.row < board.rows;

export interface Snake {
  readonly seat: Seat;
  /** Head first; `body[0]` is the cell the head last reached. */
  readonly body: readonly Cell[];
  /**
   * The move under way — out of `body[0]` and into the cell the head is
   * gliding toward. The renderer eases the head along it, so by the time a
   * player can react to it, it is already spoken for.
   */
  readonly dir: Dir;
  /** Turns flicked in but not yet taken; one is spent per move. */
  readonly queue: readonly Dir[];
  readonly alive: boolean;
}

/**
 * Park a strand ready to play.
 *
 * `bottom`'s position is the only one written down; `top`'s is derived from it
 * by rotating the whole grid half a turn, which is exactly how the far player
 * sees the plate. Neither seat can be given a better opening than the other.
 */
export function newSnake(board: Board, seat: Seat): Snake {
  const anchor: Cell = {
    col: Math.floor(board.cols / 2),
    row: Math.floor(board.rows * 0.75),
  };
  const head: Cell =
    seat === "bottom"
      ? anchor
      : { col: board.cols - 1 - anchor.col, row: board.rows - 1 - anchor.row };
  const dir: Dir = seat === "bottom" ? "up" : "down";

  const body: Cell[] = [head];
  for (let i = 1; i < START_LENGTH; i++) {
    body.push(advance(body[i - 1], opposite(dir)));
  }
  return { seat, body, dir, queue: [], alive: true };
}

export const newSnakes = (board: Board, mode: Mode): readonly Snake[] =>
  mode === "solo"
    ? [newSnake(board, "bottom")]
    : SEATS.map((seat) => newSnake(board, seat));

/**
 * Bank a turn.
 *
 * Judged against the last turn already queued rather than the live heading:
 * two quick flicks between one move and the next would otherwise let a player
 * fold the head straight back into the neck — up, left, down, all resolved on
 * a single move. Reversals and repeats are simply dropped.
 */
export function turn(snake: Snake, dir: Dir): Snake {
  if (!snake.alive || snake.queue.length >= MAX_QUEUED) return snake;
  const last = snake.queue.length > 0 ? snake.queue[snake.queue.length - 1] : snake.dir;
  if (dir === last || dir === opposite(last)) return snake;
  return { ...snake, queue: [...snake.queue, dir] };
}

/** Every cell any strand is lying on. */
export const occupiedCells = (snakes: readonly Snake[]): Cell[] =>
  snakes.flatMap((s) => s.body as Cell[]);

/**
 * Put a meatball on a free cell, or return null when the plate is full —
 * which in solo means the player has just beaten the game.
 *
 * The free cells are listed and one is drawn by index rather than guessed at
 * and retried: on a nearly full plate rejection sampling can spin for a very
 * long time, and a game loop cannot afford that on a frame it also has to draw.
 */
export function spawnFood(
  board: Board,
  occupied: readonly Cell[],
  random: () => number,
): Cell | null {
  const free: Cell[] = [];
  for (let col = 0; col < board.cols; col++) {
    for (let row = 0; row < board.rows; row++) {
      const cell = { col, row };
      if (!occupied.some((c) => sameCell(c, cell))) free.push(cell);
    }
  }
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}

export interface StepInput {
  readonly board: Board;
  readonly snakes: readonly Snake[];
  readonly food: readonly Cell[];
  readonly random: () => number;
}

export interface StepResult {
  readonly snakes: readonly Snake[];
  readonly food: readonly Cell[];
  /** Seats that ate on this move, for the score and the crunch. */
  readonly ate: readonly Seat[];
  /** Seats that crashed on this move. Two means they met head-on. */
  readonly died: readonly Seat[];
}

/**
 * Move every strand one cell.
 *
 * A move lands where `dir` already pointed, and only *then* is a queued turn
 * taken up as the next heading. Spending the turn on this move instead would
 * steer out of the cell behind the head: the renderer has spent the whole
 * interval easing the head toward the cell in front, so a flick answered
 * there drags it back through a corner it visibly never turned.
 *
 * Both strands move before anything is judged — a duel where one player's
 * move resolved first would hand them the cell in every tie. Growth is
 * decided in the same pass, because a strand that eats keeps its tail this
 * move, and a kept tail is the difference between closing a loop and biting
 * through it.
 */
export function step({ board, snakes, food, random }: StepInput): StepResult {
  const ate: Seat[] = [];
  const died: Seat[] = [];
  let left = food;

  const moved = snakes.map((snake) => {
    if (!snake.alive) return snake;
    const head = advance(snake.body[0], snake.dir);
    const eating = left.some((f) => sameCell(f, head));
    if (eating) {
      ate.push(snake.seat);
      left = left.filter((f) => !sameCell(f, head));
    }
    return {
      ...snake,
      dir: snake.queue.length > 0 ? snake.queue[0] : snake.dir,
      queue: snake.queue.slice(1),
      body: eating ? [head, ...snake.body] : [head, ...snake.body.slice(0, -1)],
    };
  });

  const settled = moved.map((snake) => {
    if (!snake.alive) return snake;
    const head = snake.body[0];
    const crashed =
      !inBounds(board, head) ||
      snake.body.slice(1).some((c) => sameCell(c, head)) ||
      moved.some(
        (other) =>
          other.alive && other.seat !== snake.seat && other.body.some((c) => sameCell(c, head)),
      );
    if (!crashed) return snake;
    died.push(snake.seat);
    return { ...snake, alive: false };
  });

  if (left.length < MEATBALLS) {
    const spot = spawnFood(board, [...occupiedCells(settled), ...left], random);
    if (spot) left = [...left, spot];
  }

  return { snakes: settled, food: left, ate, died };
}

export type Phase = "ready" | "play" | "round" | "end";

export interface Match {
  readonly mode: Mode;
  readonly phase: Phase;
  /** Rounds taken. Solo never touches these. */
  readonly rounds: Readonly<Record<Seat, number>>;
  /**
   * Meatballs eaten in the current round, which is what drives the speed.
   * In solo there is only one round, so this is also the score.
   */
  readonly eaten: number;
  /** Frames left in a timed phase; meaningless in `play` and `end`. */
  readonly timer: number;
  /** Duel match winner. Null in solo, and until someone takes the fifth. */
  readonly winner: Seat | null;
  /** Who took the last round, for the between-rounds card. Null on a draw. */
  readonly lastRound: Seat | null;
}

/**
 * Frames of countdown before a round, and of card after one. `READY_FRAMES`
 * is exported because the renderer counts it down on screen — three beats,
 * so it has to know how long a beat is.
 */
export const READY_FRAMES = 54;
export const COUNTDOWN_BEATS = 3;
const ROUND_FRAMES = 78;

/** Frames between moves at the start, at full speed, and per meatball. */
const BASE_INTERVAL = 8;
const MIN_INTERVAL = 3.4;
const RAMP = 0.22;

export function newMatch(mode: Mode): Match {
  return {
    mode,
    phase: "ready",
    rounds: { bottom: 0, top: 0 },
    eaten: 0,
    timer: READY_FRAMES,
    winner: null,
    lastRound: null,
  };
}

/**
 * Frames to wait between moves. The plate speeds up with every meatball and
 * then holds, so a long strand is fast enough to be frightening but never
 * quicker than a thumb can answer.
 */
export const stepInterval = (match: Match): number =>
  Math.max(MIN_INTERVAL, BASE_INTERVAL - match.eaten * RAMP);

export const eat = (match: Match): Match => ({ ...match, eaten: match.eaten + 1 });

/** Advance the timed phases. `play` and `end` wait on the players instead. */
export function tick(match: Match, dt: number): Match {
  if (match.phase === "play" || match.phase === "end") return match;

  const timer = match.timer - dt;
  if (timer > 0) return { ...match, timer };

  return match.phase === "ready"
    ? { ...match, phase: "play", timer: 0 }
    : { ...match, phase: "ready", timer: READY_FRAMES };
}

/**
 * Close the round on whoever crashed.
 *
 * Solo has nothing to play for afterwards, so one crash ends the match. In a
 * duel the survivor takes the round; when both crashed — they met head-on, or
 * folded at the same moment — the round is a draw and neither scores.
 */
export function endRound(match: Match, died: readonly Seat[]): Match {
  if (match.phase === "end" || died.length === 0) return match;
  if (match.mode === "solo") {
    return { ...match, phase: "end", winner: null, lastRound: null };
  }

  const survivors = SEATS.filter((seat) => !died.includes(seat));
  const lastRound = survivors.length === 1 ? survivors[0] : null;
  const rounds =
    lastRound === null
      ? match.rounds
      : { ...match.rounds, [lastRound]: match.rounds[lastRound] + 1 };
  const won = lastRound !== null && rounds[lastRound] >= ROUNDS_TO_WIN;

  return {
    ...match,
    rounds,
    eaten: 0,
    phase: won ? "end" : "round",
    timer: won ? 0 : ROUND_FRAMES,
    winner: won ? lastRound : null,
    lastRound,
  };
}
