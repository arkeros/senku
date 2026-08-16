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
} from "../game/rules.js";
import { PERSONA_IDS, type PersonaId } from "../game/bot.js";
import type { Screen } from "../game/keys";
import { DISPLAY_FONT, MONO_FONT, PALETTE as C, SAUCES, sauceFor, type Sauce } from "./palette.js";

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
  /** Which card is up. The plate is only drawn on `game`. */
  screen: Screen;
  /**
   * The persona steering `top`, or null when every seat has a person in it.
   *
   * This is the whole of the controller axis: `mode` still counts strands, and
   * this counts people. A bot match is `duel` with somebody in here. See
   * ADR 0001.
   */
  bot: PersonaId | null;
  /** Best solo score this device has seen. */
  best: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Everything a persona needs said about it, resolved once in `Play`. */
export interface PersonaLabels {
  readonly name: string;
  /** The line under the name on the roster — the only place character lives. */
  readonly line: string;
  readonly roundBy: string;
  readonly winner: string;
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
  /** The middle title button, and the hint under it. */
  readonly bot: string;
  readonly botHint: string;
  /** Drawn on the far score card all match, so the screen is never coy. */
  readonly botTag: string;
  readonly rosterTitle: string;
  readonly back: string;
  readonly personas: Readonly<Record<PersonaId, PersonaLabels>>;
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

/**
 * Placement follows the seat; orientation follows the reader.
 *
 * These two used to be one list, and in solo and in a duel they still agree:
 * one seat and one reader, or two and two. A bot match is the first time they
 * differ — `top` is a strand with a score and nobody sitting there to read it.
 *
 * So: a score card sits at its strand's end of the table and is turned to face
 * the nearest person, while a message card — the countdown, the round, the
 * game-over — is drawn once for each person and not at all for a machine.
 */
const strandSeats = (world: World): readonly Seat[] =>
  world.mode === "solo" ? ["bottom"] : SEATS;

const readers = (world: World): readonly Seat[] =>
  world.mode === "solo" || world.bot !== null ? ["bottom"] : SEATS;

/** Whoever is nearest to read a card that belongs at `seat`. */
const facing = (world: World, seat: Seat): Seat =>
  readers(world).includes(seat) ? seat : "bottom";

/**
 * Where a strand's score card goes, and whose frame it is drawn in.
 *
 * Out here rather than inside the draw call for the same reason `modeButtons`
 * is: it is arithmetic with a right answer, and the one piece of this card
 * that was left inside got it wrong. `inSeatFrame` rotates *and*, by rotating,
 * relocates — every coordinate in `drawHud` is written for the near band, so a
 * rotated card lands at the far one for free. Stop rotating a far card to keep
 * it the right way up for the only person at the table, and it stops moving
 * too: it draws straight on top of the near player's.
 *
 * So the two are computed separately. Placement follows the seat, orientation
 * follows the reader, and neither is allowed to be a side effect of the other.
 */
export function scoreCard(
  mode: Mode,
  bot: PersonaId | null,
  seat: Seat,
  h: number,
  band: number,
): { readonly reader: Seat; readonly y: number } {
  const oneReader = mode === "solo" || bot !== null;
  const reader: Seat = seat === "top" && oneReader ? "bottom" : seat;
  const rotated = reader === "top";
  return { reader, y: rotated || seat === "bottom" ? h - band / 2 : band / 2 };
}

const botAt = (world: World, seat: Seat): PersonaId | null =>
  seat === "top" ? world.bot : null;

/** Colour follows the occupant, not the position. */
const sauceOf = (world: World, seat: Seat): Sauce => {
  const persona = botAt(world, seat);
  return persona === null ? sauceFor(seat) : SAUCES[persona];
};

const nameOf = (world: World, labels: Labels, seat: Seat): string => {
  const persona = botAt(world, seat);
  return persona === null ? labels.name[seat] : labels.personas[persona].name;
};

const roundByOf = (world: World, labels: Labels, seat: Seat): string => {
  const persona = botAt(world, seat);
  return persona === null ? labels.roundBy[seat] : labels.personas[persona].roundBy;
};

const winnerOf = (world: World, labels: Labels, seat: Seat): string => {
  const persona = botAt(world, seat);
  return persona === null ? labels.winner[seat] : labels.personas[persona].winner;
};

/**
 * Where the three mode buttons sit on the title card.
 *
 * Exported because the component hit-tests against exactly these rectangles.
 * A canvas has no DOM to click, so the drawn shape and the tappable area have
 * to come from one place or they drift apart the first time either moves.
 *
 * Three is the most this card holds. On a 600px-tall phone the third button
 * ends at 522px; a fourth would end at 591 with nine pixels to spare, which is
 * why the five personas live on a card of their own instead.
 */
export function modeButtons(w: number, h: number): { solo: Rect; bot: Rect; duel: Rect } {
  const bw = Math.min(w * 0.72, 320);
  const bh = Math.max(54, Math.min(72, h * 0.082));
  const x = (w - bw) / 2;
  const top = h * 0.55;
  const gap = bh * 0.28;
  const step = bh + gap;
  return {
    solo: { x, y: top, w: bw, h: bh },
    bot: { x, y: top + step, w: bw, h: bh },
    duel: { x, y: top + step * 2, w: bw, h: bh },
  };
}

/**
 * Where the roster's five rows and its way out sit.
 *
 * Rows are shorter than the title's buttons — five of them plus a heading has
 * to fit a short phone — but never below the 44px a thumb needs.
 */
export function personaRows(
  w: number,
  h: number,
): { rows: Readonly<Record<PersonaId, Rect>>; back: Rect } {
  const bw = Math.min(w * 0.82, 360);
  const rh = Math.max(44, Math.min(62, h * 0.072));
  const x = (w - bw) / 2;
  const gap = rh * 0.18;
  const step = rh + gap;
  const top = h * 0.5 - (step * PERSONA_IDS.length - gap) / 2;

  const rows = {} as Record<PersonaId, Rect>;
  PERSONA_IDS.forEach((id, i) => {
    rows[id] = { x, y: top + step * i, w: bw, h: rh };
  });
  return {
    rows,
    back: { x, y: top + step * PERSONA_IDS.length + gap, w: bw, h: rh * 0.8 },
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
      ctx.fillStyle = sauceOf(world, seat).wash;
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
  const sauce = sauceOf(world, snake.seat);
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

  for (const seat of strandSeats(world)) {
    const { reader, y: cardY } = scoreCard(world.mode, world.bot, seat, h, band);

    inSeatFrame(ctx, reader, w, h, () => {
      const sauce = sauceOf(world, seat);
      const size = Math.min(band * 0.34, 15);
      const name = nameOf(world, labels, seat);
      text(ctx, name, w / 2, cardY - band * 0.2, size, DISPLAY_FONT, sauce.body);

      // A tag rather than a different name: you should never have to wonder
      // whether the other end of the table has a person at it.
      if (botAt(world, seat) !== null) {
        const tag = Math.max(7, size * 0.5);
        text(
          ctx,
          labels.botTag,
          w / 2 + ctx.measureText(name).width / 2 + tag * 1.6,
          cardY - band * 0.2,
          tag,
          MONO_FONT,
          "rgba(244,238,226,.45)",
        );
      }

      // One pip per round needed, filled as they are taken.
      const r = Math.min(band * 0.14, 7);
      const gap = r * 3.1;
      const left = w / 2 - (gap * (ROUNDS_TO_WIN - 1)) / 2;
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        ctx.beginPath();
        ctx.arc(left + i * gap, cardY + band * 0.16, r, 0, TAU);
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
 * A stack of text on a panel, drawn once for each *person* at the table.
 *
 * With two readers it lands in the near half of each of their views rather
 * than dead centre, so the two copies sit one above the other instead of on
 * top of each other. With one — solo, or a bot in the far seat — there is
 * nothing to avoid, so it goes in the middle.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  w: number,
  h: number,
  lines: readonly Line[],
) {
  const seats = readers(world);
  const cy = seats.length === 2 ? h * 0.72 : h * 0.5;
  const height = lines.reduce((sum, l) => sum + l.size * 1.45, 0);
  const width = Math.min(w * 0.86, 420);

  for (const seat of seats) {
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
          body: took ? roundByOf(world, labels, took) : labels.draw,
          size: big * 0.66,
          font: DISPLAY_FONT,
          color: took ? sauceOf(world, took).body : C.bone,
        },
      ]);
      return;
    }
    case "end": {
      const lines: Line[] =
        world.mode === "duel" && match.winner
          ? [
              {
                body: winnerOf(world, labels, match.winner),
                size: big * 0.72,
                font: DISPLAY_FONT,
                color: sauceOf(world, match.winner).body,
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
  // The bot button wears the sauce of whoever you played last, so the card
  // remembers you without having to say so.
  const botSauce = world.bot === null ? SAUCES.brava : SAUCES[world.bot];
  for (const [rect, sauce, label, hint] of [
    [buttons.solo, sauceFor("bottom"), labels.solo, labels.soloHint],
    [buttons.bot, botSauce, labels.bot, labels.botHint],
    [buttons.duel, sauceFor("top"), labels.duel, labels.duelHint],
  ] as const) {
    button(ctx, rect, sauce.body, label, hint);
  }
}

/**
 * Set `ctx.font` to the largest size at or below `size` that fits `maxWidth`.
 *
 * Canvas will not wrap and will not tell you it overflowed — it just draws off
 * the end of the panel and past the edge of the phone. The roster is where
 * this bites, because a persona's line is the one string in the app written
 * for meaning rather than to a length, and it is written three times in three
 * languages. Shortening the Spanish would fix today's overflow and none of
 * tomorrow's.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  body: string,
  font: string,
  size: number,
  maxWidth: number,
) {
  let px = size;
  for (;;) {
    ctx.font = `${px.toFixed(1)}px ${font}`;
    if (px <= 7 || ctx.measureText(body).width <= maxWidth) return;
    px -= 0.5;
  }
}

/** One drawn, tappable pill. The title card and the roster share it. */
function button(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  label: string,
  hint: string,
) {
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = "rgba(244,238,226,.04)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  text(
    ctx,
    label,
    rect.x + rect.w / 2,
    rect.y + rect.h * (hint ? 0.38 : 0.5),
    Math.min(rect.h * 0.34, 21),
    DISPLAY_FONT,
    color,
  );
  if (!hint) return;
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

// ---- the roster -------------------------------------------------------------

/**
 * Five sauces, and a way back out.
 *
 * The way out is not decoration: tapping BOT to see who is in there must not
 * commit you to playing one of them. The row you chose last is already marked,
 * so a rematch is two taps and neither of them is a surprise.
 */
function drawRoster(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const { rows, back } = personaRows(w, h);
  const heading = Math.min(w * 0.075, 30);
  text(
    ctx,
    labels.rosterTitle,
    w / 2,
    Object.values(rows)[0].y - heading * 1.4,
    heading,
    DISPLAY_FONT,
    C.bone,
  );

  for (const id of PERSONA_IDS) {
    const rect = rows[id];
    const sauce = SAUCES[id];
    const chosen = world.bot === id;

    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h * 0.32);
    ctx.fillStyle = chosen ? sauce.wash : "rgba(244,238,226,.03)";
    ctx.fill();
    ctx.lineWidth = chosen ? 2.5 : 1.25;
    ctx.strokeStyle = chosen ? sauce.body : C.rim;
    ctx.stroke();

    // A blob of the sauce itself, so the row and the strand you are about to
    // face are obviously the same thing.
    ctx.beginPath();
    ctx.arc(rect.x + rect.h * 0.5, rect.y + rect.h / 2, rect.h * 0.19, 0, TAU);
    ctx.fillStyle = sauce.body;
    ctx.fill();

    const left = rect.x + rect.h * 0.86;
    const room = rect.x + rect.w - left - rect.h * 0.3;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    fitFont(ctx, labels.personas[id].name, DISPLAY_FONT, Math.min(rect.h * 0.34, 19), room);
    ctx.fillStyle = sauce.body;
    ctx.fillText(labels.personas[id].name, left, rect.y + rect.h * 0.36);

    fitFont(ctx, labels.personas[id].line, MONO_FONT, Math.min(rect.h * 0.2, 11), room);
    ctx.fillStyle = "rgba(244,238,226,.5)";
    ctx.fillText(labels.personas[id].line, left, rect.y + rect.h * 0.68);
    ctx.textAlign = "center";
  }

  button(ctx, back, "rgba(244,238,226,.45)", labels.back, "");
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

  if (world.screen === "title") {
    drawTitle(ctx, world, labels, w, h);
    return;
  }

  if (world.screen === "roster") {
    drawRoster(ctx, world, labels, w, h);
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
