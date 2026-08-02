import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_EGGS,
  bounceWalls,
  clampPaddle,
  collide,
  concede,
  layout,
  newMatch,
  serve,
  speedLimits,
  tick,
} from "./rules.js";

/** A portrait phone, the shape this game is actually played on. */
const field = layout(400, 800);

const puckAt = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy });

test("layout: the arena sits inside the padding", () => {
  assert.equal(field.left, field.pad);
  assert.equal(field.right, 400 - field.pad);
  assert.equal(field.top, field.pad);
  assert.equal(field.bottom, 800 - field.pad);
  assert.equal(field.cx, 200);
  assert.equal(field.cy, 400);
});

test("layout: the goal mouth is centred and narrower than the arena", () => {
  assert.equal(field.goalLeft + field.goalRight, 2 * field.cx);
  assert.ok(field.goalRight - field.goalLeft < field.w);
});

test("layout: radii scale with the short edge but never vanish", () => {
  const tiny = layout(120, 200);
  assert.ok(tiny.paddleR >= 24);
  assert.ok(tiny.puckR >= 13);
  assert.ok(layout(800, 1600).paddleR > tiny.paddleR);
});

test("clampPaddle: neither player may cross the halfway line", () => {
  // Bottom player reaching far up, top player reaching far down.
  assert.ok(clampPaddle(field, 1, { x: 200, y: 0 }).y > field.cy);
  assert.ok(clampPaddle(field, -1, { x: 200, y: 800 }).y < field.cy);
});

test("clampPaddle: the paddle stays fully inside the side walls", () => {
  assert.equal(clampPaddle(field, 1, { x: -500, y: 600 }).x, field.left + field.paddleR);
  assert.equal(clampPaddle(field, 1, { x: 5000, y: 600 }).x, field.right - field.paddleR);
});

test("clampPaddle: a legal position is left alone", () => {
  const spot = { x: 200, y: 600 };
  assert.deepEqual(clampPaddle(field, 1, spot), spot);
});

test("bounceWalls: side walls reflect horizontally", () => {
  const l = bounceWalls(field, puckAt(field.left, 400, -3, 1));
  assert.ok(l.puck.vx > 0);
  assert.equal(l.puck.x, field.left + field.puckR);
  assert.equal(l.hit, true);
  assert.equal(l.conceded, null);

  const r = bounceWalls(field, puckAt(field.right, 400, 3, 1));
  assert.ok(r.puck.vx < 0);
});

test("bounceWalls: back walls reflect outside the goal mouth", () => {
  const x = field.goalLeft - field.puckR - 1;
  const top = bounceWalls(field, puckAt(x, field.top, 0, -3));
  assert.ok(top.puck.vy > 0);
  assert.equal(top.conceded, null);
});

test("bounceWalls: crossing the line inside the mouth concedes", () => {
  // Off the top edge: the top player (-1) has been scored on.
  assert.equal(bounceWalls(field, puckAt(200, field.top - 50, 0, -3)).conceded, -1);
  // Off the bottom edge: the bottom player (1) has been scored on.
  assert.equal(bounceWalls(field, puckAt(200, field.bottom + 50, 0, 3)).conceded, 1);
});

test("bounceWalls: mid-arena travel is untouched", () => {
  const moving = puckAt(200, 400, 2, -2);
  const out = bounceWalls(field, moving);
  assert.deepEqual(out.puck, moving);
  assert.equal(out.hit, false);
});

test("collide: no contact returns null", () => {
  const paddle = { x: 200, y: 600, vx: 0, vy: 0 };
  assert.equal(collide(field, puckAt(200, 300, 0, 3), paddle, 0), null);
});

test("collide: contact pushes the puck clear and sends it away", () => {
  const paddle = { x: 200, y: 600, vx: 0, vy: 0 };
  // Puck overlapping the paddle from above, travelling down into it.
  const hit = collide(field, puckAt(200, 600 - field.paddleR, 0, 4), paddle, 0);
  assert.ok(hit);
  // Pushed out to exactly touching distance, and now heading back up.
  const gap = Math.hypot(hit.x - paddle.x, hit.y - paddle.y);
  assert.ok(Math.abs(gap - (field.puckR + field.paddleR)) < 1e-6);
  assert.ok(hit.vy < 0);
});

test("collide: a moving paddle hits harder than a still one", () => {
  const still = { x: 200, y: 600, vx: 0, vy: 0 };
  const swung = { x: 200, y: 600, vx: 0, vy: -6 };
  const overlap = () => puckAt(200, 600 - field.paddleR, 0, 2);
  const a = collide(field, overlap(), still, 0);
  const b = collide(field, overlap(), swung, 0);
  assert.ok(Math.hypot(b.vx, b.vy) > Math.hypot(a.vx, a.vy));
});

test("collide: never exceeds the rally's speed ceiling", () => {
  const rocket = { x: 200, y: 600, vx: 0, vy: -400 };
  const hit = collide(field, puckAt(200, 600 - field.paddleR, 0, 300), rocket, 0);
  const { max } = speedLimits(field, 0);
  // The paddle's own velocity is added after clamping, so allow its share.
  assert.ok(Math.hypot(hit.vx, hit.vy) <= max + Math.hypot(rocket.vx, rocket.vy) * 0.35 + 1e-6);
});

test("speedLimits: the ceiling rises with the rally, then stops", () => {
  const cold = speedLimits(field, 0).max;
  const warm = speedLimits(field, 5).max;
  const hot = speedLimits(field, 10).max;
  assert.ok(warm > cold);
  assert.ok(hot > warm);
  assert.equal(speedLimits(field, 100).max, hot);
});

test("serve: aims at the named side and starts inside the limits", () => {
  const rng = () => 0.5;
  const down = serve(field, 1, rng);
  assert.ok(down.vy > 0, "serving toward the bottom player travels down");
  assert.ok(serve(field, -1, rng).vy < 0);
  assert.equal(down.x, field.cx);
  assert.equal(down.y, field.cy);

  const { min, max } = speedLimits(field, 0);
  const speed = Math.hypot(down.vx, down.vy);
  assert.ok(speed >= min && speed <= max);
});

test("serve: the angle varies with the source of randomness", () => {
  assert.notEqual(serve(field, 1, () => 0).vx, serve(field, 1, () => 1).vx);
});

test("TARGET_EGGS: five to win", () => {
  assert.equal(TARGET_EGGS, 5);
});

test("newMatch: nobody has scored and the countdown is running", () => {
  const m = newMatch(1);
  assert.deepEqual(m.eggs, { bottom: 0, top: 0 });
  assert.equal(m.phase, "serve");
  assert.equal(m.serveTo, 1);
  assert.ok(m.timer > 0);
});

test("concede: the other side gets the egg", () => {
  // The top player was scored on, so the bottom player scores.
  const m = concede(newMatch(1), -1);
  assert.deepEqual(m.eggs, { bottom: 1, top: 0 });
  assert.equal(m.phase, "goal");
});

test("concede: whoever was scored on receives the next serve", () => {
  assert.equal(concede(newMatch(1), -1).serveTo, -1);
  assert.equal(concede(newMatch(1), 1).serveTo, 1);
});

test("concede: the fifth egg ends the match", () => {
  let m = newMatch(1);
  for (let i = 0; i < TARGET_EGGS; i++) m = concede(m, -1);
  assert.equal(m.eggs.bottom, TARGET_EGGS);
  assert.equal(m.phase, "end");
  assert.equal(m.winner, "bottom");
});

test("concede: a finished match ignores further goals", () => {
  let m = newMatch(1);
  for (let i = 0; i < TARGET_EGGS; i++) m = concede(m, -1);
  assert.equal(concede(m, 1), m);
});

test("tick: the countdown runs down into play", () => {
  let m = newMatch(1);
  assert.equal(m.phase, "serve");
  m = tick(m, m.timer + 1);
  assert.equal(m.phase, "play");
});

test("tick: after a goal the match returns to the countdown", () => {
  let m = concede(newMatch(1), -1);
  assert.equal(m.phase, "goal");
  m = tick(m, m.timer + 1);
  assert.equal(m.phase, "serve");
  assert.ok(m.timer > 0);
});

test("tick: play and end are not on a timer", () => {
  const playing = tick(tick(newMatch(1), 999), 999);
  assert.equal(playing.phase, "play");

  let over = newMatch(1);
  for (let i = 0; i < TARGET_EGGS; i++) over = concede(over, -1);
  assert.equal(tick(over, 999), over);
});
