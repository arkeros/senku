/** 1 is the player at the bottom of the screen, -1 the player at the top. */
export type Side = 1 | -1;

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Puck extends Vec {
  readonly vx: number;
  readonly vy: number;
}

export type Paddle = Puck;

export interface Field {
  readonly pad: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
  readonly goalLeft: number;
  readonly goalRight: number;
  /** Scale factor so speeds and sizes read the same on any screen. */
  readonly unit: number;
  readonly paddleR: number;
  readonly puckR: number;
}

/** Eggs to win. */
export const TARGET_EGGS = 5;

/** Rally length at which the meteor is as fast as it will ever get. */
const FULL_HEAT = 10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Everything geometric is derived from the short edge, so the arena keeps its
 * proportions from a small phone to a tablet. The `Math.max` floors stop the
 * dinos and the meteor collapsing into untappable dots on tiny screens.
 */
export function layout(width: number, height: number): Field {
  const short = Math.min(width, height);
  const pad = Math.max(16, short * 0.055);
  const left = pad;
  const right = width - pad;
  const top = pad;
  const bottom = height - pad;
  const w = right - left;
  const cx = width / 2;
  const goal = Math.min(w * 0.48, short * 0.62);
  return {
    pad,
    left,
    right,
    top,
    bottom,
    w,
    h: bottom - top,
    cx,
    cy: height / 2,
    goalLeft: cx - goal / 2,
    goalRight: cx + goal / 2,
    unit: short / 420,
    paddleR: Math.max(24, short * 0.085),
    puckR: Math.max(13, short * 0.045),
  };
}

/**
 * A dino is penned into its own half and inside the walls.
 *
 * The halfway limit overlaps the centre line by a sliver of the dino's radius
 * so a player can just reach a meteor sitting on the line — without that, a
 * puck that stalls dead centre is unplayable for both of them.
 */
export function clampPaddle(field: Field, side: Side, at: Vec): Vec {
  const reach = field.paddleR * 0.15;
  const minY = side === 1 ? field.cy + reach : field.top + field.paddleR;
  const maxY = side === 1 ? field.bottom - field.paddleR : field.cy - reach;
  return {
    x: clamp(at.x, field.left + field.paddleR, field.right - field.paddleR),
    y: clamp(at.y, minY, maxY),
  };
}

/**
 * The meteor heats up as the rally goes on: the ceiling climbs for the first
 * ten hits and then holds. The floor keeps it from ever loitering.
 */
export function speedLimits(field: Field, rally: number): { min: number; max: number } {
  const heat = Math.min(1, rally / FULL_HEAT);
  return {
    min: 2.4 * field.unit,
    max: (7.4 + heat * 7) * field.unit,
  };
}

/**
 * Side walls always reflect. The back walls reflect too, except across the
 * goal mouth — there the meteor flies through, and once it is clear of the
 * line the side it passed has conceded.
 */
export function bounceWalls(
  field: Field,
  puck: Puck,
): { puck: Puck; hit: boolean; conceded: Side | null } {
  let { x, y, vx, vy } = puck;
  let hit = false;

  if (x - field.puckR < field.left) {
    x = field.left + field.puckR;
    vx = Math.abs(vx);
    hit = true;
  } else if (x + field.puckR > field.right) {
    x = field.right - field.puckR;
    vx = -Math.abs(vx);
    hit = true;
  }

  const inMouth = x > field.goalLeft && x < field.goalRight;
  if (inMouth) {
    // A little past the line before it counts, so the goal reads as a ball
    // crossing rather than grazing.
    const slack = field.puckR * 0.2;
    if (y < field.top - slack) return { puck: { x, y, vx, vy }, hit, conceded: -1 };
    if (y > field.bottom + slack) return { puck: { x, y, vx, vy }, hit, conceded: 1 };
  } else {
    if (y - field.puckR < field.top) {
      y = field.top + field.puckR;
      vy = Math.abs(vy);
      hit = true;
    } else if (y + field.puckR > field.bottom) {
      y = field.bottom - field.puckR;
      vy = -Math.abs(vy);
      hit = true;
    }
  }

  return { puck: { x, y, vx, vy }, hit, conceded: null };
}

/**
 * Elastic-ish bounce off a dino. Returns null when they aren't touching.
 *
 * The meteor leaves along the line between the two centres, at a speed built
 * from its own plus a share of how hard the dino was swung — which is what
 * makes a deliberate strike feel different from parking in its path. A
 * fraction of the dino's velocity is added afterwards so glancing hits carry
 * some sideways drift.
 */
export function collide(
  field: Field,
  puck: Puck,
  paddle: Paddle,
  rally: number,
): Puck | null {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const gap = Math.hypot(dx, dy) || 1;
  const touching = field.puckR + field.paddleR;
  if (gap >= touching) return null;

  const nx = dx / gap;
  const ny = dy / gap;
  const { min, max } = speedLimits(field, rally);
  const speed = Math.hypot(puck.vx, puck.vy);
  const swing = Math.hypot(paddle.vx, paddle.vy);
  const out = Math.min(max, Math.max(min * 1.4, speed * 1.03 + swing * 0.85));

  return {
    x: paddle.x + nx * touching,
    y: paddle.y + ny * touching,
    vx: nx * out + paddle.vx * 0.35,
    vy: ny * out + paddle.vy * 0.35,
  };
}

export type Phase = "serve" | "play" | "goal" | "end";

/** Which end of the screen a player sits at. */
export type Seat = "bottom" | "top";

export const seatOf = (side: Side): Seat => (side === 1 ? "bottom" : "top");

export interface Match {
  readonly phase: Phase;
  readonly eggs: Readonly<Record<Seat, number>>;
  /** Which side the next serve travels toward. */
  readonly serveTo: Side;
  /** Frames left in a timed phase; meaningless in `play` and `end`. */
  readonly timer: number;
  readonly winner: Seat | null;
  /** Who took the most recent egg, for the between-goals banner. */
  readonly lastScorer: Seat | null;
}

/** Frames of countdown before a serve, and of celebration after a goal. */
const SERVE_FRAMES = 60;
const GOAL_FRAMES = 70;

export function newMatch(serveTo: Side): Match {
  return {
    phase: "serve",
    eggs: { bottom: 0, top: 0 },
    serveTo,
    timer: SERVE_FRAMES,
    winner: null,
    lastScorer: null,
  };
}

/**
 * Register a goal against `side` — the player who let the meteor past.
 *
 * The serve then travels back toward whoever conceded, so the player who is
 * behind gets the meteor coming at them rather than having to chase it.
 */
export function concede(match: Match, side: Side): Match {
  if (match.phase === "end") return match;

  const scorer = seatOf(side === 1 ? -1 : 1);
  const eggs = { ...match.eggs, [scorer]: match.eggs[scorer] + 1 };
  const won = eggs[scorer] >= TARGET_EGGS;

  return {
    ...match,
    eggs,
    phase: won ? "end" : "goal",
    timer: won ? 0 : GOAL_FRAMES,
    serveTo: side,
    winner: won ? scorer : null,
    lastScorer: scorer,
  };
}

/** Advance the timed phases. `play` and `end` wait on the players instead. */
export function tick(match: Match, dt: number): Match {
  if (match.phase === "play" || match.phase === "end") return match;

  const timer = match.timer - dt;
  if (timer > 0) return { ...match, timer };

  return match.phase === "serve"
    ? { ...match, phase: "play", timer: 0 }
    : { ...match, phase: "serve", timer: SERVE_FRAMES };
}

/** Drop the meteor on the centre spot, aimed at `toward` with a bit of yaw. */
export function serve(field: Field, toward: Side, random: () => number): Puck {
  const angle = random() * 0.7 - 0.35;
  const speed = 4.2 * field.unit;
  return {
    x: field.cx,
    y: field.cy,
    vx: Math.sin(angle) * speed,
    vy: Math.cos(angle) * speed * toward,
  };
}
