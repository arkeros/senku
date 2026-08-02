import {
  TARGET_EGGS,
  type Field,
  type Match,
  type Seat,
  type Side,
} from "../game/rules";
import {
  DISPLAY_FONT,
  MONO_FONT,
  PALETTE as C,
  skinFor,
  type DinoSkin,
} from "./palette";

export interface Dino {
  readonly side: Side;
  readonly seat: Seat;
  readonly skin: DinoSkin;
  /** Triceratops gets a frill and horns; T-rex gets a jaw. */
  readonly horned: boolean;
  x: number;
  y: number;
  /** Where the finger is; the dino eases toward it. */
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  touch: number | string | null;
  /** Faces the meteor. */
  ang: number;
  /** Counts down after a hit, driving the flash ring. */
  flash: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  col: string;
}

export interface Trail {
  x: number;
  y: number;
  life: number;
}

export interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation, and how fast it tumbles. */
  a: number;
  spin: number;
}

export interface World {
  field: Field;
  match: Match;
  meteor: Meteor;
  dinos: readonly [Dino, Dino];
  trail: Trail[];
  sparks: Spark[];
  rally: number;
  shake: number;
  frame: number;
  /** False until the first tap, while the title card is up. */
  started: boolean;
}

/**
 * Every string the arena draws. Built once per render by the route component,
 * which owns the i18n call sites — the draw code stays language-agnostic.
 */
export interface Labels {
  readonly title: string;
  readonly tagline: string;
  readonly howTo: string;
  readonly tapToStart: string;
  readonly go: string;
  readonly playAgain: string;
  readonly goalBy: Readonly<Record<Seat, string>>;
  readonly winner: Readonly<Record<Seat, string>>;
}

const TAU = Math.PI * 2;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawArena(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  const f = world.field;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, w, h);

  // Each half tinted toward its player's colour.
  for (const [seat, toEdge] of [
    ["bottom", h],
    ["top", 0],
  ] as const) {
    const g = ctx.createLinearGradient(0, f.cy, 0, toEdge);
    g.addColorStop(0, C.basalt);
    g.addColorStop(1, skinFor(seat).wash);
    ctx.fillStyle = g;
    seat === "bottom" ? ctx.fillRect(0, f.cy, w, h - f.cy) : ctx.fillRect(0, 0, w, f.cy);
  }

  // Lava seams in the rock.
  ctx.strokeStyle = "rgba(242,118,46,.13)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = f.top + (f.h * (i + 0.5)) / 7;
    ctx.beginPath();
    ctx.moveTo(f.left, y);
    for (let j = 1; j <= 5; j++) {
      ctx.lineTo(f.left + (f.w * j) / 5, y + Math.sin(i * 3 + j * 2) * 16);
    }
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(3, f.unit * 3);
  ctx.strokeStyle = C.line;
  roundRect(ctx, f.left, f.top, f.w, f.h, Math.min(f.w, f.h) * 0.06);
  ctx.stroke();

  // Goal mouths: a gap punched in the wall, glowing inward.
  for (const seat of ["bottom", "top"] as const) {
    const s = seat === "bottom" ? 1 : -1;
    const y = seat === "bottom" ? f.bottom : f.top;
    const col = skinFor(seat).body;
    ctx.save();
    ctx.strokeStyle = C.night;
    ctx.lineWidth = Math.max(5, f.unit * 5);
    ctx.beginPath();
    ctx.moveTo(f.goalLeft, y);
    ctx.lineTo(f.goalRight, y);
    ctx.stroke();

    const glow = ctx.createLinearGradient(0, y, 0, y - s * f.pad * 1.6);
    glow.addColorStop(0, col);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.fillRect(
      f.goalLeft,
      seat === "bottom" ? y - f.pad * 1.6 : y,
      f.goalRight - f.goalLeft,
      f.pad * 1.6,
    );
    ctx.globalAlpha = 1;

    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(3, f.unit * 3);
    ctx.beginPath();
    ctx.moveTo(f.goalLeft, y);
    ctx.lineTo(f.goalLeft, y - s * f.pad * 0.9);
    ctx.moveTo(f.goalRight, y);
    ctx.lineTo(f.goalRight, y - s * f.pad * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([10 * f.unit, 10 * f.unit]);
  ctx.beginPath();
  ctx.moveTo(f.left, f.cy);
  ctx.lineTo(f.right, f.cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ammonite spiral on the centre spot.
  const r0 = Math.min(f.w, f.h) * 0.13;
  ctx.beginPath();
  ctx.arc(f.cx, f.cy, r0, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.strokeStyle = "rgba(243,231,208,.13)";
  ctx.lineWidth = Math.max(2, f.unit * 2);
  ctx.beginPath();
  for (let a = 0; a < 22; a += 0.12) {
    const r = r0 * 0.82 * Math.exp(-0.11 * (22 - a));
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // Egg scoreboard beside each goal.
  for (const seat of ["bottom", "top"] as const) {
    const y = seat === "bottom" ? f.bottom - f.pad * 1.5 : f.top + f.pad * 1.5;
    const er = Math.max(5, f.unit * 6);
    const gap = er * 3.2;
    for (let i = 0; i < TARGET_EGGS; i++) {
      const ex = f.cx + (i - (TARGET_EGGS - 1) / 2) * gap;
      ctx.beginPath();
      ctx.ellipse(ex, y, er * 0.78, er, 0, 0, TAU);
      if (i < world.match.eggs[seat]) {
        ctx.fillStyle = skinFor(seat).body;
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(243,231,208,.22)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

function drawMeteor(ctx: CanvasRenderingContext2D, world: World) {
  const { phase } = world.match;
  if (phase === "goal" || phase === "end") return;
  const f = world.field;
  const m = world.meteor;
  const heat = Math.min(1, world.rally / 10);

  for (const t of world.trail) {
    const k = t.life / 16;
    ctx.globalAlpha = k * 0.5;
    ctx.fillStyle = heat > 0.5 ? C.lava : C.ember;
    ctx.beginPath();
    ctx.arc(t.x, t.y, f.puckR * k * 0.9, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const halo = f.puckR * (2 + heat * 1.6);
  const glow = ctx.createRadialGradient(m.x, m.y, f.puckR * 0.4, m.x, m.y, halo);
  glow.addColorStop(0, `rgba(255,194,75,${0.55 + heat * 0.4})`);
  glow.addColorStop(1, "rgba(242,118,46,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(m.x, m.y, halo, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.a);
  ctx.fillStyle = heat > 0.7 ? "#FFE9B0" : C.lava;
  ctx.beginPath();
  ctx.arc(0, 0, f.puckR * 1.08, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#2A1B3D";
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = f.puckR * (0.82 + (i % 2) * 0.2);
    i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255,194,75,${0.25 + heat * 0.6})`;
  ctx.beginPath();
  ctx.arc(-f.puckR * 0.25, -f.puckR * 0.2, f.puckR * 0.34, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(f.puckR * 0.3, f.puckR * 0.25, f.puckR * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawDino(ctx: CanvasRenderingContext2D, world: World, d: Dino) {
  const R = world.field.paddleR;
  const skin = d.skin;
  const body = d.flash > 0 ? skin.light : skin.body;

  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.ang);

  ctx.fillStyle = skin.dark;
  ctx.beginPath();
  ctx.moveTo(-R * 0.42, R * 0.5);
  ctx.quadraticCurveTo(0, R * 1.75, R * 0.42, R * 0.5);
  ctx.closePath();
  ctx.fill();

  for (const [lx, ly] of [
    [-0.85, -0.15],
    [0.85, -0.15],
    [-0.8, 0.55],
    [0.8, 0.55],
  ]) {
    ctx.beginPath();
    ctx.ellipse(R * lx, R * ly, R * 0.26, R * 0.19, 0, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, R * 0.12, R * 0.78, R * 0.86, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.beginPath();
  ctx.ellipse(0, R * 0.3, R * 0.52, R * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin.light;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, R * (0.55 - i * 0.34), R * 0.13, R * 0.1, 0, 0, TAU);
    ctx.fill();
  }

  if (d.horned) {
    ctx.fillStyle = skin.dark;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.62, R * 0.62, R * 0.44, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = skin.light;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.62, R * 0.44, R * 0.3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -R * 0.72, R * 0.36, R * 0.42, 0, 0, TAU);
  ctx.fill();

  if (d.horned) {
    ctx.fillStyle = "#FFF3D8";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(R * 0.3 * s, -R * 0.9);
      ctx.lineTo(R * 0.22 * s, -R * 1.35);
      ctx.lineTo(R * 0.12 * s, -R * 0.88);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = skin.dark;
    ctx.beginPath();
    ctx.ellipse(0, -R * 1.0, R * 0.24, R * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#FFF3D8";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(R * 0.1 * s, -R * 1.12);
      ctx.lineTo(R * 0.19 * s, -R * 1.24);
      ctx.lineTo(R * 0.02 * s, -R * 1.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = "#FFF3D8";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(R * 0.19 * s, -R * 0.78, R * 0.11, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = C.night;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(R * 0.19 * s, -R * 0.82, R * 0.055, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  if (d.flash > 0) {
    ctx.strokeStyle = skin.light;
    ctx.globalAlpha = d.flash / 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(d.x, d.y, R * (1 + (1 - d.flash / 12) * 0.4), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, world: World) {
  for (const q of world.sparks) {
    ctx.globalAlpha = Math.min(1, q.life / 14);
    ctx.fillStyle = q.col;
    ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalAlpha = 1;
}

/**
 * Two players sit across a phone lying on the table, so every message is
 * drawn twice — once upright for the bottom player, once rotated for the top.
 */
function banner(
  ctx: CanvasRenderingContext2D,
  world: World,
  seat: Seat,
  text: string,
  sub: string,
  size: number,
) {
  const f = world.field;
  ctx.save();
  ctx.translate(f.cx, seat === "bottom" ? f.cy + f.h * 0.17 : f.cy - f.h * 0.17);
  if (seat === "top") ctx.rotate(Math.PI);
  ctx.textAlign = "center";
  ctx.font = `${size}px ${DISPLAY_FONT}`;
  ctx.fillStyle = "rgba(12,7,24,.8)";
  ctx.fillText(text, 2, 2);
  ctx.fillStyle = C.lava;
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = `${Math.max(11, size * 0.32)}px ${MONO_FONT}`;
    ctx.fillStyle = C.bone;
    ctx.fillText(sub, 0, size * 0.85);
  }
  ctx.restore();
}

function titleCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  seat: Seat,
  short: number,
) {
  const f = world.field;
  ctx.save();
  ctx.translate(f.cx, seat === "bottom" ? f.cy + f.h * 0.22 : f.cy - f.h * 0.22);
  if (seat === "top") ctx.rotate(Math.PI);
  ctx.textAlign = "center";
  ctx.font = `${short * 0.085}px ${DISPLAY_FONT}`;
  ctx.fillStyle = C.ember;
  ctx.fillText(labels.title, 3, 3);
  ctx.fillStyle = C.lava;
  ctx.fillText(labels.title, 0, 0);
  ctx.font = `${Math.max(11, short * 0.032)}px ${MONO_FONT}`;
  ctx.fillStyle = C.bone;
  ctx.fillText(labels.tagline, 0, short * 0.075);
  ctx.fillText(labels.howTo, 0, short * 0.115);
  if (world.frame % 60 < 38) {
    ctx.font = `${Math.max(13, short * 0.042)}px ${DISPLAY_FONT}`;
    ctx.fillStyle = skinFor(seat).body;
    ctx.fillText(labels.tapToStart, 0, short * 0.185);
  }
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  world: World,
  labels: Labels,
  w: number,
  h: number,
) {
  const { match, shake } = world;

  ctx.save();
  if (shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * 2 * shake, (Math.random() - 0.5) * 2 * shake);
  }
  drawArena(ctx, world, w, h);
  drawMeteor(ctx, world);
  for (const d of world.dinos) drawDino(ctx, world, d);
  drawSparks(ctx, world);
  ctx.restore();

  const short = Math.min(w, h);
  const seats = ["bottom", "top"] as const;

  if (!world.started) {
    ctx.fillStyle = "rgba(12,7,24,.72)";
    ctx.fillRect(0, 0, w, h);
    for (const seat of seats) titleCard(ctx, world, labels, seat, short);
    return;
  }

  if (match.phase === "serve") {
    const n = Math.ceil(match.timer / 20);
    const text = n > 1 ? String(n - 1) : labels.go;
    for (const seat of seats) {
      banner(ctx, world, seat, text, "", short * (n > 1 ? 0.13 : 0.1));
    }
  } else if (match.phase === "goal" && match.lastScorer) {
    for (const seat of seats) {
      const mine = match.eggs[seat];
      const theirs = match.eggs[seat === "bottom" ? "top" : "bottom"];
      banner(ctx, world, seat, labels.goalBy[match.lastScorer], `${mine} — ${theirs}`, short * 0.06);
    }
  } else if (match.phase === "end" && match.winner) {
    ctx.fillStyle = "rgba(12,7,24,.6)";
    ctx.fillRect(0, 0, w, h);
    for (const seat of seats) {
      banner(ctx, world, seat, labels.winner[match.winner], labels.playAgain, short * 0.075);
    }
  }
}
