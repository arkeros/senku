// `.js` because this resolves at runtime, unlike the type-only imports in
// `swipe.ts` and `keys.ts` — deciding a move means walking the board.
import {
  advance,
  inBounds,
  opposite,
  sameCell,
  type Board,
  type Cell,
  type Dir,
  type Snake,
} from "./rules.js";

/**
 * A bot, which is a controller and not a rule.
 *
 * It hands back a heading and the caller spends it through `turn`, exactly as
 * a flick does — so it obeys the reversal rule and the queue cap because the
 * rulebook enforces them, not because this file remembers to. `rules.ts` never
 * learns that one of its strands is artificial. See ADR 0001.
 *
 * Value in, value out, and no randomness at all: ties go to continuing
 * straight. A random tie-break makes a strand visibly wobble between two
 * equally good options, and once limited sight is the stated reason a bot ever
 * loses, a second source of failure undermines it. Variety comes from where
 * the meatballs land and from the person at the other end.
 */

/** What a bot wants. A persona is a named value of this. */
export interface Traits {
  /**
   * Cells of free space it counts before it stops looking. Its entire sense of
   * danger, and the only dial that decides whether it survives: below this it
   * plays perfectly, beyond it it is blind. See ADR 0002.
   */
  readonly horizon: number;
  /** Weight on closing on a meatball — and so on how fast it grows into its own limits. */
  readonly appetite: number;
  /** Weight on taking the cells in front of the other head. Crowding, never colliding. */
  readonly menace: number;
  /** How it scores a move that would kill them both. */
  readonly trade: "refuse" | "neutral" | "seek";
}

export interface BotInput {
  readonly board: Board;
  /** The strand being steered. */
  readonly self: Snake;
  /** The other strand, or null when there is nobody to read. */
  readonly foe: Snake | null;
  readonly food: readonly Cell[];
  readonly traits: Traits;
}

const DIRS: readonly Dir[] = ["up", "down", "left", "right"];

/**
 * Where the head will be by the time the heading being chosen is spent.
 *
 * `step` completes the move `dir` already points at and only *then* takes a
 * queued turn, so what the bot is choosing is the move after next. Planning
 * from `body[0]` would steer out of the cell behind the head — the same
 * mistake commit b639603 fixed for the far player's flicks.
 */
const glidingInto = (self: Snake): Cell => advance(self.body[0], self.dir);

/**
 * A strand one move on: the head advances along the heading already spoken
 * for and the tail comes in behind it — unless it is about to eat, in which
 * case the tail stays put and the strand is a cell longer. A kept tail is the
 * difference between closing a loop and biting through it, for a bot reading
 * the board exactly as it is for a strand moving over it.
 *
 * Only one move is projected, not two. By the time the chosen heading lands,
 * both tails will have come in one cell further than this says — so the bot
 * reads a little less room than it really has. That conservatism is deliberate
 * and cheap: it costs a sliver of strength in exactly the direction we want it
 * lost, and it keeps one projection serving both the gate and the fill.
 */
function project(snake: Snake, food: readonly Cell[]): readonly Cell[] {
  const head = advance(snake.body[0], snake.dir);
  const eating = food.some((f) => sameCell(f, head));
  return eating ? [head, ...snake.body] : [head, ...snake.body.slice(0, -1)];
}

/** Every cell that will still be spaghetti when the chosen move lands. */
function blockedCells({ self, foe, food }: BotInput): readonly Cell[] {
  const mine = project(self, food);
  return foe?.alive ? [...mine, ...project(foe, food)] : mine;
}

const keyOf = (cell: Cell) => `${cell.col},${cell.row}`;

/**
 * How much room there is through a door, counted up to `cap` and no further.
 *
 * The cap is the whole of ADR 0002. A fill that runs to completion tells a bot
 * exactly which pockets are graves, and a bot that knows that never dies —
 * which makes a round that only ends on a crash unwinnable in the dull
 * direction. Stopping at `cap` leaves it able to read the plate perfectly up
 * close and not at all beyond, so it walks into the large slow trap and not
 * the small obvious one. That is how a person loses, and it is legible
 * afterwards by pointing at the board.
 *
 * Breadth-first rather than depth-first so the cells counted are the ones
 * nearest the door: what the bot is really asking is "is there room *here*",
 * and a depth-first count would answer with a thread reaching across the plate.
 */
export function roomBeyond(
  board: Board,
  blocked: readonly Cell[],
  from: Cell,
  cap: number,
): number {
  const walls = new Set(blocked.map(keyOf));
  if (cap <= 0 || !inBounds(board, from) || walls.has(keyOf(from))) return 0;

  const seen = new Set([keyOf(from)]);
  const queue: Cell[] = [from];
  let counted = 0;

  while (queue.length > 0 && counted < cap) {
    const cell = queue.shift()!;
    counted++;
    for (const dir of DIRS) {
      const next = advance(cell, dir);
      const key = keyOf(next);
      if (!inBounds(board, next) || seen.has(key) || walls.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return counted;
}

/**
 * The heading this bot wants next.
 *
 * Always answers: `step` is going to move the strand whatever the bot thinks
 * about it, and a cornered bot still has to pick which wall it prefers.
 *
 * Space is a gate rather than a term in a sum, so no appetite and no amount of
 * menace can talk a bot into a pocket. That keeps the four traits independent —
 * retuning aggression cannot quietly retune survival — and it is what leaves
 * `horizon` as the only reason a bot ever dies. See ADR 0002.
 */
export function botDir(input: BotInput): Dir {
  const { board, self, traits } = input;
  const from = glidingInto(self);
  const blocked = blockedCells(input);

  // Straight on comes first, so it wins every tie for free: a bot that picks
  // between equally good cells by any other rule dithers, visibly, forever.
  // The reversal is dropped here rather than left for `turn` to refuse — a
  // heading `turn` throws away is a move the bot silently failed to make.
  const ordered = [self.dir, ...DIRS.filter((d) => d !== self.dir && d !== opposite(self.dir))];

  const legal = ordered.filter((dir) => {
    const cell = advance(from, dir);
    return inBounds(board, cell) && !blocked.some((c) => sameCell(c, cell));
  });
  if (legal.length === 0) return ordered[0];

  const room = new Map<Dir, number>(
    legal.map((dir) => [dir, roomBeyond(board, blocked, advance(from, dir), traits.horizon)]),
  );

  // Room enough is "as much as I am long" — or "as far as I can see", when the
  // strand has outgrown its own horizon. Without that second clause a bot long
  // enough to exceed its sight would find every move wanting and spend the
  // rest of the round in the cornered branch below.
  const needed = Math.min(self.body.length, traits.horizon);
  const roomy = legal.filter((dir) => room.get(dir)! >= needed);

  // Cornered: nothing survives the gate, so buy time. Dying four moves from
  // now beats dying on this one, and it is the only branch where the strand
  // is out of options rather than choosing between them.
  if (roomy.length === 0) {
    return legal.reduce((best, dir) => (room.get(dir)! > room.get(best)! ? dir : best), legal[0]);
  }

  // Everything left is survivable, so the traits get to choose among equals —
  // and only among equals. `>` rather than `>=` keeps the earliest, which is
  // straight on.
  const score = (dir: Dir) => wanting(input, advance(from, dir));
  return roomy.reduce((best, dir) => (score(dir) > score(best) ? dir : best), roomy[0]);
}

const manhattan = (a: Cell, b: Cell) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

/** A sign, not a magnitude: what a mutual kill is worth to this bot. */
const TRADE_SIGN: Readonly<Record<Traits["trade"], number>> = {
  refuse: -1,
  neutral: 0,
  seek: 1,
};

/**
 * Where the other head might be standing when this move lands.
 *
 * Not where it will be one move from now — that cell is already spaghetti as
 * far as gate 1 is concerned — but the three it could turn into after that.
 * Landing on one of them is the head-on that kills both strands, and `endRound`
 * scores that as a draw: nobody takes the round, `eaten` resets, and the whole
 * position is thrown away for free. That is why `trade` is a stated trait
 * rather than something a hunting bot is left to discover. See ADR 0002.
 */
function foeReach(foe: Snake | null): readonly Cell[] {
  if (!foe?.alive) return [];
  const front = advance(foe.body[0], foe.dir);
  return DIRS.filter((d) => d !== opposite(foe.dir)).map((d) => advance(front, d));
}

/**
 * How much this bot wants that cell.
 *
 * Every term is scaled to roughly nought-to-one against the size of the plate,
 * so `appetite` and `menace` are comparable to each other on any phone — a
 * weight that means one thing in portrait and another in landscape would make
 * the personas untunable.
 *
 * Survival is not in here. It was settled by the gate, and leaving it out is
 * what keeps the traits independent of one another.
 */
function wanting({ board, foe, food, traits }: BotInput, cell: Cell): number {
  const span = board.cols + board.rows;

  const nearestFood = food.reduce((best, f) => Math.min(best, manhattan(cell, f)), Infinity);
  const hunger = food.length === 0 ? 0 : 1 - nearestFood / span;

  const front = foe?.alive ? advance(foe.body[0], foe.dir) : null;
  const pressure = front === null ? 0 : 1 - manhattan(cell, front) / span;

  const risky = foeReach(foe).some((c) => sameCell(c, cell)) ? 1 : 0;

  return traits.appetite * hunger + traits.menace * pressure + TRADE_SIGN[traits.trade] * risky;
}

/** The five sauces, and the only place their numbers are written down. */
export type PersonaId = "ketchup" | "mayo" | "alioli" | "brava" | "kamikaze";

export const PERSONA_IDS: readonly PersonaId[] = [
  "ketchup",
  "mayo",
  "alioli",
  "brava",
  "kamikaze",
];

/**
 * Ordered gently to nastily, which is how the roster lists them — but they are
 * not rungs on a ladder. `mayo` and `brava` share a horizon and play nothing
 * alike, and a player who beats one has learned very little about the other.
 *
 * The horizons are measured rather than guessed. Alone on a 16×32 plate, a
 * bot's lifespan climbs with sight and then stops climbing:
 *
 * | horizon | 4–8 | 12 | 24 | 32 | 64 | 96 | 160 | 512 |
 * | moves   | 668 | 807 | 953 | 1249 | 1671 | 2744 | 2744 | 2744 |
 *
 * Everything from 96 up is the same bot — the one that plays the plate
 * perfectly and only ever dies because it ran out of plate. So `high` is 64,
 * comfortably under that knee, and not the 120 this table was first written
 * with, which was exactly the never-crashing opponent ADR 0002 exists to
 * forbid. Re-measure if the plate's dimensions change; the knee is a property
 * of the board, not of the code.
 *
 * The other three numbers are still guesses. No test may depend on the
 * magnitude of any of them.
 */
export const PERSONAS: Readonly<Record<PersonaId, Traits>> = {
  /** Everyone's first sauce. Dives at every meatball and ties itself in a knot. */
  ketchup: { horizon: 12, appetite: 1, menace: 0, trade: "refuse" },
  /** Thick, slow, gets everywhere. Won't beat you — will outlast you. */
  mayo: { horizon: 64, appetite: 0.3, menace: 0, trade: "refuse" },
  /** Doesn't come for you and doesn't get out of the way. Sticks to you. */
  alioli: { horizon: 32, appetite: 0.6, menace: 0.5, trade: "neutral" },
  /** Takes the ground in front of you, and never once trades. */
  brava: { horizon: 64, appetite: 0.6, menace: 1, trade: "refuse" },
  /** Brava with alioli in it — brava taken too far. */
  kamikaze: { horizon: 32, appetite: 1, menace: 1, trade: "seek" },
};
