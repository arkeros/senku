import { centerOf, type Board } from "../game/board";
import {
  SIDES,
  flagCount,
  pepperCount,
  type Field,
  type Side,
  type Tile,
} from "../game/field";
import { PEPPERS_TO_WIN, seconds, type Match, type Mode } from "../game/match";
import {
  DISPLAY_FONT,
  MONO_FONT,
  NEAR_COLORS,
  PALETTE as C,
  sauceFor,
} from "./palette";

/** A flake of pepper thrown off a tile that just turned over. */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  col: string;
}

/** The finger currently held on a cell, and how far into a long press it is. */
export interface Press {
  readonly cell: number;
  /** 0 to 1. At 1 the flag has just landed. */
  readonly progress: number;
}

export interface World {
  board: Board;
  field: Field;
  match: Match;
  mode: Mode;
  /** Null unless a solo player is mid-hold; a duel has nothing to flag. */
  press: Press | null;
  sparks: Spark[];
  shake: number;
  frame: number;
  /** False while the title card is up and no mode has been picked. */
  started: boolean;
  /** Fastest solo sweep this device has seen, in seconds. 0 for none. */
  best: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Every string the board draws. Built once per render by the route component,
 * which owns the i18n call sites — the draw code stays language-agnostic.
 */
export interface Labels {
  readonly title: string;
  readonly tagline: string;
  readonly solo: string;
  readonly duel: string;
  readonly soloHint: string;
  readonly duelHint: string;
  /** The one gesture a player will not find on their own. */
  readonly holdHint: string;
  readonly remaining: string;
  readonly time: string;
  readonly best: string;
  readonly swept: string;
  readonly bitten: string;
  readonly playAgain: string;
  readonly name: Readonly<Record<Side, string>>;
  readonly winner: Readonly<Record<Side, string>>;
}

const TAU = Math.PI * 2;

const clock = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

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

// ---- the griddle ------------------------------------------------------------

function drawGriddle(ctx: CanvasRenderingContext2D, board: Board) {
  const w = board.cols * board.cell;
  const h = board.rows * board.cell;
  const lip = board.cell * 0.34;

  roundRect(ctx, board.originX - lip, board.originY - lip, w + lip * 2, h + lip * 2, lip);
  ctx.fillStyle = C.plate;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.rim;
  ctx.stroke();
}

/** The square one cell occupies, inset so the tiles read as separate pieces. */
function tileRect(board: Board, col: number, row: number): Rect {
  const gap = Math.max(1, board.cell * 0.05);
  return {
    x: board.originX + col * board.cell + gap,
    y: board.originY + row * board.cell + gap,
    w: board.cell - gap * 2,
    h: board.cell - gap * 2,
  };
}

/**
 * An unturned tile: flat fill, a lit top-left edge and a shaded bottom-right
 * one. Two strokes rather than a gradient — this runs once per cell per
 * frame, and on a full board that is several hundred fills.
 */
function drawHiddenTile(ctx: CanvasRenderingContext2D, r: Rect, sunken: boolean) {
  const radius = r.w * 0.16;
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = sunken ? C.open : C.tile;
  ctx.fill();
  if (sunken) return;

  ctx.lineWidth = Math.max(1, r.w * 0.07);
  const inset = ctx.lineWidth / 2;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(r.x + inset, r.y + r.h - radius);
  ctx.lineTo(r.x + inset, r.y + radius);
  ctx.lineTo(r.x + r.w - radius, r.y + inset);
  ctx.strokeStyle = C.tileLip;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r.x + r.w - inset, r.y + radius);
  ctx.lineTo(r.x + r.w - inset, r.y + r.h - radius);
  ctx.lineTo(r.x + radius, r.y + r.h - inset);
  ctx.strokeStyle = C.tileShade;
  ctx.stroke();
}

/** A turned tile: a recess in the griddle, with whatever was under it. */
function drawOpenTile(ctx: CanvasRenderingContext2D, r: Rect) {
  roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.16);
  ctx.fillStyle = C.open;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.grid;
  ctx.stroke();
}

/**
 * A padrón pepper: tapered, slightly curved, with its stalk still on.
 *
 * The same shape whatever is inside it — that is the saying the game is named
 * after, and the reason a hot one is told apart by the heat around it rather
 * than by being drawn differently.
 */
function drawPepper(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hot: boolean,
) {
  if (hot) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, TAU);
    ctx.fillStyle = C.emberGlow;
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.3);

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.bezierCurveTo(r * 0.72, -r * 0.45, r * 0.58, r * 0.62, 0, r * 0.85);
  ctx.bezierCurveTo(-r * 0.58, r * 0.62, -r * 0.72, -r * 0.45, 0, -r * 0.55);
  ctx.closePath();
  ctx.fillStyle = hot ? C.ember : C.pepper;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = hot ? "#8C2317" : C.pepperDark;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.5);
  ctx.quadraticCurveTo(r * 0.16, -r * 0.9, r * 0.34, -r * 1.02);
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.lineCap = "round";
  ctx.strokeStyle = C.stalk;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-r * 0.22, -r * 0.06, r * 0.1, r * 0.3, -0.2, 0, TAU);
  ctx.fillStyle = hot ? "rgba(255,220,210,.4)" : C.pepperLight;
  ctx.globalAlpha = 0.55;
  ctx.fill();

  ctx.restore();
}

/** A cocktail stick with a paper flag, in whoever's colour planted it. */
function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - r * 0.06, y + r * 0.9);
  ctx.lineTo(x - r * 0.06, y - r * 0.85);
  ctx.lineWidth = Math.max(1.2, r * 0.14);
  ctx.strokeStyle = C.stalk;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.85);
  ctx.lineTo(x + r * 0.86, y - r * 0.48);
  ctx.lineTo(x, y - r * 0.12);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Struck through: a flag left on a cell that never had a pepper under it. */
function drawCross(ctx: CanvasRenderingContext2D, r: Rect) {
  const m = r.w * 0.24;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, r.w * 0.1);
  ctx.strokeStyle = C.ember;
  ctx.beginPath();
  ctx.moveTo(r.x + m, r.y + m);
  ctx.lineTo(r.x + r.w - m, r.y + r.h - m);
  ctx.moveTo(r.x + r.w - m, r.y + m);
  ctx.lineTo(r.x + m, r.y + r.h - m);
  ctx.stroke();
  ctx.restore();
}

/**
 * The ring that fills under a held finger.
 *
 * A long press is the one gesture with nothing on screen to suggest it, so it
 * shows its own progress: a player who rests a thumb by accident sees where
 * the gesture was going and learns it without being told.
 */
function drawPressRing(ctx: CanvasRenderingContext2D, r: Rect, progress: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r.w * 0.36, -TAU / 4, -TAU / 4 + TAU * progress);
  ctx.lineWidth = Math.max(2, r.w * 0.1);
  ctx.lineCap = "round";
  ctx.strokeStyle = C.bone;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawTiles(ctx: CanvasRenderingContext2D, world: World) {
  const { board, field, match } = world;
  // A solo game that is over shows its work: every pepper still buried, and
  // every flag that was wrong. A duel never does — the board it was played on
  // is still half a secret, and the loser gets to keep wondering.
  const exposed = world.mode === "solo" && match.phase === "end";
  const digit = board.cell * 0.56;

  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const i = row * board.cols + col;
      const rect = tileRect(board, col, row);
      const tile: Tile = field.tiles[i];
      const held = world.press?.cell === i;
      const { x, y } = centerOf(board, col, row);
      const r = board.cell * 0.34;

      switch (tile.kind) {
        case "hidden":
          drawHiddenTile(ctx, rect, held);
          if (held && world.press) drawPressRing(ctx, rect, world.press.progress);
          if (exposed && field.hot[i]) {
            ctx.globalAlpha = 0.45;
            drawPepper(ctx, x, y, r, false);
            ctx.globalAlpha = 1;
          }
          break;

        case "flagged":
          drawHiddenTile(ctx, rect, false);
          drawFlag(ctx, x, y, r, C.ember);
          if (exposed && !field.hot[i]) drawCross(ctx, rect);
          break;

        case "revealed":
          drawOpenTile(ctx, rect);
          if (field.hot[i]) {
            // The one that bit. Nothing else on the board is drawn hot.
            drawPepper(ctx, x, y, r * 1.1, true);
          } else if (field.near[i] > 0) {
            text(ctx, String(field.near[i]), x, y, digit, DISPLAY_FONT, NEAR_COLORS[field.near[i]]);
          }
          break;

        case "taken":
          drawOpenTile(ctx, rect);
          drawPepper(ctx, x, y, r, false);
          drawFlag(ctx, x + r * 0.5, y - r * 0.15, r * 0.62, sauceFor(tile.by).body);
          break;
      }
    }
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, world: World) {
  for (const s of world.sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life / 20));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fillStyle = s.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- the score strip --------------------------------------------------------

function drawSoloHud(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const { pad, band } = world.board;
  const y = h - pad - band / 2;
  const size = Math.max(14, Math.min(band * 0.44, 26));
  const small = Math.max(9, size * 0.42);

  // Peppers still unaccounted for: what is out there, less what is marked.
  // It goes negative when a player over-flags, which is information rather
  // than an error, so it is shown as it is.
  const left = pepperCount(world.field) - flagCount(world.field);
  const columns: readonly (readonly [string, string, number])[] = [
    [labels.remaining, String(left), w * 0.28],
    [labels.time, clock(seconds(world.match)), w * 0.72],
  ];

  for (const [caption, value, x] of columns) {
    text(ctx, value, x, y - small * 0.55, size, DISPLAY_FONT, C.bone);
    text(ctx, caption, x, y + size * 0.6, small, MONO_FONT, "rgba(233,238,240,.45)");
  }

  // The record goes in the band *above* the board, which is otherwise empty.
  // It is the one number on screen with nothing to do with the game in
  // progress, and three stacked lines do not fit in one band anyway.
  if (world.best > 0) {
    text(
      ctx,
      `${labels.best} ${clock(world.best)}`,
      w / 2,
      pad + band / 2,
      small,
      MONO_FONT,
      "rgba(233,238,240,.38)",
    );
  }
}

function drawDuelHud(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const band = world.board.band;
  const y = h - world.board.pad - band / 2;
  const half = w / 2;
  const name = Math.max(12, Math.min(band * 0.32, 18));
  const r = Math.min(band * 0.13, 7);

  for (const [n, side] of SIDES.entries()) {
    const cx = half * (n + 0.5);
    const sauce = sauceFor(side);
    const active = world.match.turn === side && world.match.phase === "play";

    if (active) {
      const pw = Math.min(half * 0.86, 200);
      roundRect(ctx, cx - pw / 2, y - band * 0.44, pw, band * 0.88, band * 0.22);
      ctx.fillStyle = sauce.wash;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = sauce.body;
      ctx.stroke();
    }

    ctx.globalAlpha = active ? 1 : 0.45;
    text(ctx, labels.name[side], cx, y - band * 0.18, name, DISPLAY_FONT, sauce.body);

    // One pip per pepper needed, filled as they are found.
    const gap = r * 3;
    const first = cx - (gap * (PEPPERS_TO_WIN - 1)) / 2;
    for (let i = 0; i < PEPPERS_TO_WIN; i++) {
      ctx.beginPath();
      ctx.arc(first + i * gap, y + band * 0.2, r, 0, TAU);
      if (i < world.match.found[side]) {
        ctx.fillStyle = sauce.body;
        ctx.fill();
      } else {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(233,238,240,.28)";
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

const drawHud = (
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) => (world.mode === "solo" ? drawSoloHud : drawDuelHud)(ctx, world, labels, w, h);

// ---- cards ------------------------------------------------------------------

interface Line {
  readonly body: string;
  readonly size: number;
  readonly font: string;
  readonly color: string;
}

/** A stack of text on a panel, over the middle of the board. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lines: readonly Line[],
) {
  const height = lines.reduce((sum, l) => sum + l.size * 1.45, 0);
  const width = Math.min(w * 0.86, 420);
  const cy = h * 0.46;

  roundRect(ctx, (w - width) / 2, cy - height / 2 - 20, width, height + 40, 18);
  ctx.fillStyle = "rgba(11,14,16,.88)";
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
}

function drawEndCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const big = Math.min(w * 0.13, 54);
  const small = Math.min(w * 0.042, 17);
  const { match } = world;

  const headline: Line =
    match.winner !== null
      ? {
          body: labels.winner[match.winner],
          size: big * 0.7,
          font: DISPLAY_FONT,
          color: sauceFor(match.winner).body,
        }
      : {
          body: match.outcome === "swept" ? labels.swept : labels.bitten,
          size: big * 0.62,
          font: DISPLAY_FONT,
          color: match.outcome === "swept" ? C.pepper : C.ember,
        };

  const time: Line[] =
    world.mode === "solo"
      ? [
          {
            body: `${labels.time} ${clock(seconds(match))}`,
            size: small * 1.3,
            font: MONO_FONT,
            color: C.bone,
          },
        ]
      : [];

  drawCard(ctx, w, h, [
    headline,
    ...time,
    { body: labels.playAgain, size: small, font: MONO_FONT, color: "rgba(233,238,240,.55)" },
  ]);
}

// ---- the title card ---------------------------------------------------------

function drawTitle(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  // A row of peppers along the top, bobbing gently: the card says what is
  // under the tiles before anyone has committed to a mode.
  const r = Math.min(w, h) / 22;
  for (let i = 0; i < 5; i++) {
    const x = w / 2 + (i - 2) * r * 2.4;
    const y = h * 0.28 + Math.sin(i * 0.8 + world.frame * 0.03) * r * 0.4;
    drawPepper(ctx, x, y, r, false);
  }

  const size = Math.min(w * 0.098, 44);
  text(ctx, labels.title, w / 2, h * 0.44, size, DISPLAY_FONT, C.bone);
  text(
    ctx,
    labels.tagline,
    w / 2,
    h * 0.44 + size * 0.9,
    Math.min(w * 0.036, 14),
    MONO_FONT,
    "rgba(233,238,240,.55)",
  );

  const buttons = modeButtons(w, h);
  for (const [key, rect, sauce, hint] of [
    ["solo", buttons.solo, sauceFor("left"), labels.soloHint],
    ["duel", buttons.duel, sauceFor("right"), labels.duelHint],
  ] as const) {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fillStyle = "rgba(233,238,240,.04)";
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
      "rgba(233,238,240,.5)",
    );
  }

  text(
    ctx,
    labels.holdHint,
    w / 2,
    Math.min(buttons.duel.y + buttons.duel.h + 34, h - 20),
    Math.min(w * 0.032, 12),
    MONO_FONT,
    "rgba(233,238,240,.38)",
  );
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
    ctx.translate(Math.sin(world.frame * 1.7) * k * 0.5, Math.cos(world.frame * 2.3) * k * 0.5);
  }

  drawGriddle(ctx, world.board);
  drawTiles(ctx, world);
  drawSparks(ctx, world);
  ctx.restore();

  drawHud(ctx, world, labels, w, h);
  if (world.match.phase === "end") drawEndCard(ctx, world, labels, w, h);
}
