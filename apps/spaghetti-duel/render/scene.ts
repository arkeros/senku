import {
  COUNTDOWN_BEATS,
  READY_FRAMES,
  ROUNDS_TO_WIN,
  SEATS,
  centerOf,
  type Board,
  type Cell,
  type Dir,
  type Match,
  type Mode,
  type Seat,
  type Snake,
} from "../game/rules";
import { DISPLAY_FONT, MONO_FONT, PALETTE as C, sauceFor } from "./palette";

export interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  col: string;
}

export interface World {
  board: Board;
  match: Match;
  mode: Mode;
  snakes: readonly Snake[];
  food: readonly Cell[];
  crumbs: Crumb[];
  /**
   * How far through the gap between grid moves we are, 0 to 1. The rules move
   * a whole cell at a time; this is what stops that looking like a slideshow.
   */
  slide: number;
  shake: number;
  frame: number;
  /** False while the title card is up and no mode has been picked. */
  started: boolean;
  /** Best solo score this device has seen. */
  best: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Every string the plate draws. Built once per render by the route component,
 * which owns the i18n call sites — the draw code stays language-agnostic.
 */
export interface Labels {
  readonly title: string;
  readonly tagline: string;
  readonly solo: string;
  readonly duel: string;
  readonly soloHint: string;
  readonly duelHint: string;
  readonly go: string;
  readonly score: string;
  readonly best: string;
  readonly gameOver: string;
  readonly playAgain: string;
  readonly draw: string;
  readonly name: Readonly<Record<Seat, string>>;
  readonly roundBy: Readonly<Record<Seat, string>>;
  readonly winner: Readonly<Record<Seat, string>>;
}

const TAU = Math.PI * 2;

const DIR_VEC: Readonly<Record<Dir, { x: number; y: number }>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D,
  body: string,
  x: number,
  y: number,
  size: number,
  font: string,
  color: string,
) {
  ctx.font = `${Math.round(size)}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(body, x, y);
}

/**
 * Run `draw` in the frame of whoever is sitting at `seat`.
 *
 * The far player is looking at the same glass from the opposite end, so
 * anything with a top and a bottom — a word, a countdown, a row of pips —
 * has to be drawn a second time, rotated half a turn about the middle of the
 * screen. Coordinates inside `draw` are always written for the near player.
 */
function inSeatFrame(
  ctx: CanvasRenderingContext2D,
  seat: Seat,
  w: number,
  h: number,
  draw: () => void,
) {
  if (seat === "bottom") {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI);
  ctx.translate(-w / 2, -h / 2);
  draw();
  ctx.restore();
}

/** The seats a given mode draws for: one in solo, both in a duel. */
const seatsOf = (mode: Mode): readonly Seat[] => (mode === "solo" ? ["bottom"] : SEATS);

/**
 * Where the two mode buttons sit on the title card.
 *
 * Exported because the component hit-tests against exactly these rectangles.
 * A canvas has no DOM to click, so the drawn shape and the tappable area have
 * to come from one place or they drift apart the first time either moves.
 */
export function modeButtons(w: number, h: number): { solo: Rect; duel: Rect } {
  const bw = Math.min(w * 0.72, 320);
  const bh = Math.max(54, Math.min(72, h * 0.082));
  const x = (w - bw) / 2;
  const top = h * 0.55;
  const gap = bh * 0.28;
  return {
    solo: { x, y: top, w: bw, h: bh },
    duel: { x, y: top + bh + gap, w: bw, h: bh },
  };
}

export const hits = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ---- the plate --------------------------------------------------------------

function drawPlate(ctx: CanvasRenderingContext2D, world: World) {
  const b = world.board;
  const x = b.originX;
  const y = b.originY;
  const w = b.cols * b.cell;
  const h = b.rows * b.cell;

  roundRect(ctx, x, y, w, h, b.cell * 0.9);
  ctx.fillStyle = C.plate;
  ctx.fill();

  // In a duel each half is washed toward its player's sauce, so a glance
  // tells you which end of the plate is yours.
  if (world.mode === "duel") {
    ctx.save();
    ctx.clip();
    for (const seat of SEATS) {
      ctx.fillStyle = sauceFor(seat).wash;
      ctx.fillRect(x, seat === "top" ? y : y + h / 2, w, h / 2);
    }
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = 1;
    ctx.setLineDash([b.cell * 0.35, b.cell * 0.35]);
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 1; col < b.cols; col++) {
    ctx.moveTo(x + col * b.cell, y);
    ctx.lineTo(x + col * b.cell, y + h);
  }
  for (let row = 1; row < b.rows; row++) {
    ctx.moveTo(x, y + row * b.cell);
    ctx.lineTo(x + w, y + row * b.cell);
  }
  ctx.stroke();

  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, b.cell * 0.9);
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMeatballs(ctx: CanvasRenderingContext2D, world: World) {
  const b = world.board;
  // A slow breath, so a meatball is findable on a busy plate.
  const pulse = 1 + Math.sin(world.frame * 0.09) * 0.06;
  for (const cell of world.food) {
    const { x, y } = centerOf(b, cell);
    const r = b.cell * 0.36 * pulse;

    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, TAU);
    ctx.fillStyle = "rgba(226,69,47,.14)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = C.meat;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.strokeStyle = C.meatDark;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.26, 0, TAU);
    ctx.fillStyle = C.meatShine;
    ctx.fill();
  }
}

/**
 * The centre line of a strand, with the ends eased between grid cells.
 *
 * The head is pushed forward and the tail pulled in by the same fraction of a
 * cell, which is exactly what the next move is about to make true — so the
 * strand appears to flow continuously while the rules underneath still move
 * in whole squares.
 */
function strandPath(board: Board, snake: Snake, slide: number) {
  const pts = snake.body.map((c) => centerOf(board, c));
  if (!snake.alive || pts.length < 2) return pts;

  const step = board.cell * slide;
  const d = DIR_VEC[snake.dir];
  pts[0] = { x: pts[0].x + d.x * step, y: pts[0].y + d.y * step };

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  pts[pts.length - 1] = {
    x: last.x + (prev.x - last.x) * slide,
    y: last.y + (prev.y - last.y) * slide,
  };
  return pts;
}

function drawStrand(ctx: CanvasRenderingContext2D, world: World, snake: Snake) {
  const b = world.board;
  const sauce = sauceFor(snake.seat);
  const pts = strandPath(b, snake, world.slide);
  const head = pts[0];

  ctx.save();
  if (!snake.alive) ctx.globalAlpha = 0.34;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

  // Three passes over one path: a dark under-noodle for depth, the sauce
  // itself, then a thin highlight down the middle so it reads as round.
  ctx.strokeStyle = sauce.dark;
  ctx.lineWidth = b.cell * 0.82;
  ctx.stroke();
  ctx.strokeStyle = sauce.body;
  ctx.lineWidth = b.cell * 0.64;
  ctx.stroke();
  ctx.strokeStyle = sauce.light;
  ctx.globalAlpha *= 0.5;
  ctx.lineWidth = b.cell * 0.16;
  ctx.stroke();
  ctx.globalAlpha = snake.alive ? 1 : 0.34;

  // The head, with eyes — the one part that has to say which way this thing
  // is about to go without the player tracing the whole strand.
  const r = b.cell * 0.44;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, TAU);
  ctx.fillStyle = sauce.body;
  ctx.fill();
  ctx.lineWidth = b.cell * 0.1;
  ctx.strokeStyle = sauce.dark;
  ctx.stroke();

  const d = DIR_VEC[snake.dir];
  const eye = r * 0.42;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      head.x + d.x * r * 0.3 - d.y * side * r * 0.42,
      head.y + d.y * r * 0.3 + d.x * side * r * 0.42,
      eye,
      0,
      TAU,
    );
    ctx.fillStyle = C.bone;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      head.x + d.x * r * 0.46 - d.y * side * r * 0.42,
      head.y + d.y * r * 0.46 + d.x * side * r * 0.42,
      eye * 0.5,
      0,
      TAU,
    );
    ctx.fillStyle = C.night;
    ctx.fill();
  }

  ctx.restore();
}

function drawCrumbs(ctx: CanvasRenderingContext2D, world: World) {
  for (const q of world.crumbs) {
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 22));
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r, 0, TAU);
    ctx.fillStyle = q.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- the ends of the table --------------------------------------------------

function drawHud(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const band = world.board.originY;
  const y = h - band / 2;

  if (world.mode === "solo") {
    const size = Math.max(12, Math.min(band * 0.5, 30));
    text(ctx, String(world.match.eaten), w / 2, y - size * 0.24, size, DISPLAY_FONT, C.bone);
    text(
      ctx,
      `${labels.best} ${Math.max(world.best, world.match.eaten)}`,
      w / 2,
      y + size * 0.66,
      Math.max(9, size * 0.38),
      MONO_FONT,
      "rgba(244,238,226,.5)",
    );
    return;
  }

  for (const seat of seatsOf(world.mode)) {
    inSeatFrame(ctx, seat, w, h, () => {
      const sauce = sauceFor(seat);
      const size = Math.min(band * 0.34, 15);
      text(ctx, labels.name[seat], w / 2, y - band * 0.2, size, DISPLAY_FONT, sauce.body);

      // One pip per round needed, filled as they are taken.
      const r = Math.min(band * 0.14, 7);
      const gap = r * 3.1;
      const left = w / 2 - (gap * (ROUNDS_TO_WIN - 1)) / 2;
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        ctx.beginPath();
        ctx.arc(left + i * gap, y + band * 0.16, r, 0, TAU);
        if (i < world.match.rounds[seat]) {
          ctx.fillStyle = sauce.body;
          ctx.fill();
        } else {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(244,238,226,.28)";
          ctx.stroke();
        }
      }
    });
  }
}

interface Line {
  readonly body: string;
  readonly size: number;
  readonly font: string;
  readonly color: string;
}

/**
 * A stack of text on a panel, drawn once for each player.
 *
 * In a duel it lands in the near half of each player's view rather than dead
 * centre, so the two copies sit one above the other instead of on top of
 * each other.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  w: number,
  h: number,
  lines: readonly Line[],
) {
  const cy = world.mode === "duel" ? h * 0.72 : h * 0.5;
  const height = lines.reduce((sum, l) => sum + l.size * 1.45, 0);
  const width = Math.min(w * 0.86, 420);

  for (const seat of seatsOf(world.mode)) {
    inSeatFrame(ctx, seat, w, h, () => {
      roundRect(ctx, (w - width) / 2, cy - height / 2 - 18, width, height + 36, 18);
      ctx.fillStyle = "rgba(20,16,13,.82)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.rim;
      ctx.stroke();

      let y = cy - height / 2;
      for (const line of lines) {
        y += (line.size * 1.45) / 2;
        text(ctx, line.body, w / 2, y, line.size, line.font, line.color);
        y += (line.size * 1.45) / 2;
      }
    });
  }
}

function drawPhaseCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const big = Math.min(w * 0.13, 54);
  const small = Math.min(w * 0.042, 17);
  const { match } = world;

  switch (match.phase) {
    case "ready": {
      // Three beats — the last one is the word rather than the number, so
      // there is no silent gap between "1" and the strands moving.
      const beat = Math.max(1, Math.ceil(match.timer / (READY_FRAMES / COUNTDOWN_BEATS)));
      drawCard(ctx, world, w, h, [
        {
          body: beat === 1 ? labels.go : String(beat - 1),
          size: big * (beat === 1 ? 0.9 : 1.2),
          font: DISPLAY_FONT,
          color: beat === 1 ? sauceFor("bottom").body : C.bone,
        },
      ]);
      return;
    }
    case "round": {
      const took = match.lastRound;
      drawCard(ctx, world, w, h, [
        {
          body: took ? labels.roundBy[took] : labels.draw,
          size: big * 0.66,
          font: DISPLAY_FONT,
          color: took ? sauceFor(took).body : C.bone,
        },
      ]);
      return;
    }
    case "end": {
      const lines: Line[] =
        world.mode === "duel" && match.winner
          ? [
              {
                body: labels.winner[match.winner],
                size: big * 0.72,
                font: DISPLAY_FONT,
                color: sauceFor(match.winner).body,
              },
            ]
          : [
              { body: labels.gameOver, size: big * 0.6, font: DISPLAY_FONT, color: C.tomato },
              {
                body: `${labels.score} ${match.eaten}`,
                size: small * 1.35,
                font: MONO_FONT,
                color: C.bone,
              },
              {
                body: `${labels.best} ${Math.max(world.best, match.eaten)}`,
                size: small,
                font: MONO_FONT,
                color: "rgba(244,238,226,.55)",
              },
            ];
      drawCard(ctx, world, w, h, [
        ...lines,
        { body: labels.playAgain, size: small, font: MONO_FONT, color: "rgba(244,238,226,.55)" },
      ]);
      return;
    }
    default:
      return;
  }
}

// ---- the title card ---------------------------------------------------------

function drawTitle(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const cell = Math.min(w, h) / 16;

  // A decorative strand looping across the top, so the card shows what the
  // game looks like before anyone has committed to a mode.
  const wave: { x: number; y: number }[] = [];
  for (let i = 0; i <= 9; i++) {
    wave.push({
      x: w * 0.16 + (i / 9) * w * 0.68,
      y: h * 0.3 + Math.sin(i * 0.9 + world.frame * 0.02) * cell * 1.1,
    });
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(wave[0].x, wave[0].y);
  for (let i = 1; i < wave.length; i++) ctx.lineTo(wave[i].x, wave[i].y);
  ctx.strokeStyle = sauceFor("bottom").dark;
  ctx.lineWidth = cell * 0.8;
  ctx.stroke();
  ctx.strokeStyle = sauceFor("bottom").body;
  ctx.lineWidth = cell * 0.62;
  ctx.stroke();

  const last = wave[wave.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, cell * 0.42, 0, TAU);
  ctx.fillStyle = C.meat;
  ctx.fill();

  text(ctx, labels.title, w / 2, h * 0.44, Math.min(w * 0.125, 52), DISPLAY_FONT, C.bone);
  text(
    ctx,
    labels.tagline,
    w / 2,
    h * 0.44 + Math.min(w * 0.125, 52) * 0.8,
    Math.min(w * 0.036, 14),
    MONO_FONT,
    "rgba(244,238,226,.55)",
  );

  const buttons = modeButtons(w, h);
  for (const [key, rect, sauce, hint] of [
    ["solo", buttons.solo, sauceFor("bottom"), labels.soloHint],
    ["duel", buttons.duel, sauceFor("top"), labels.duelHint],
  ] as const) {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fillStyle = "rgba(244,238,226,.04)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = sauce.body;
    ctx.stroke();
    text(
      ctx,
      key === "solo" ? labels.solo : labels.duel,
      rect.x + rect.w / 2,
      rect.y + rect.h * 0.38,
      Math.min(rect.h * 0.34, 21),
      DISPLAY_FONT,
      sauce.body,
    );
    text(
      ctx,
      hint,
      rect.x + rect.w / 2,
      rect.y + rect.h * 0.73,
      Math.min(rect.h * 0.19, 12),
      MONO_FONT,
      "rgba(244,238,226,.5)",
    );
  }
}

// ---- the whole frame --------------------------------------------------------

export function drawScene(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, w, h);

  if (!world.started) {
    drawTitle(ctx, world, labels, w, h);
    return;
  }

  ctx.save();
  if (world.shake > 0.3) {
    const k = world.shake;
    ctx.translate(
      Math.sin(world.frame * 1.7) * k * 0.5,
      Math.cos(world.frame * 2.3) * k * 0.5,
    );
  }

  drawPlate(ctx, world);
  drawMeatballs(ctx, world);
  for (const snake of world.snakes) drawStrand(ctx, world, snake);
  drawCrumbs(ctx, world);
  ctx.restore();

  drawHud(ctx, world, labels, w, h);
  drawPhaseCard(ctx, world, labels, w, h);
}
