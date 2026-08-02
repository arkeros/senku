import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import {
  bounceWalls,
  clampPaddle,
  collide,
  concede,
  layout,
  newMatch,
  seatOf,
  serve,
  speedLimits,
  tick,
  type Side,
} from "../../../game/rules";
import { PALETTE, skinFor } from "../../../render/palette";
import {
  drawScene,
  type Dino,
  type Labels,
  type World,
} from "../../../render/scene";

type ArenaProps = {
  labels: Labels;
};

const styles = stylex.create({
  canvas: {
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
  },
});

const between = (a: number, b: number) => a + Math.random() * (b - a);

function makeDino(side: Side): Dino {
  const seat = seatOf(side);
  return {
    side,
    seat,
    skin: skinFor(seat),
    horned: seat === "top",
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
    touch: null,
    ang: 0,
    flash: 0,
  };
}

export function Arena({ labels }: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads labels through a ref so a locale change never restarts the
  // match — the effect below is deliberately mounted once.
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    const world: World = {
      field: layout(1, 1),
      match: newMatch(1),
      meteor: { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0 },
      dinos: [makeDino(1), makeDino(-1)],
      trail: [],
      sparks: [],
      rally: 0,
      shake: 0,
      frame: 0,
      started: false,
    };

    const buzz = (pattern: number | number[]) => {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* vibration is a nicety; a refusal is not an error */
      }
    };

    const burst = (x: number, y: number, n: number, col: string, spd: number) => {
      for (let i = 0; i < n; i++) {
        world.sparks.push({
          x,
          y,
          vx: between(-spd, spd) * world.field.unit,
          vy: between(-spd, spd) * world.field.unit,
          life: between(16, 32),
          r: between(1.5, 4) * world.field.unit,
          col,
        });
      }
    };

    function parkDinos() {
      const f = world.field;
      for (const d of world.dinos) {
        d.x = f.cx;
        d.y = d.side === 1 ? f.bottom - f.h * 0.18 : f.top + f.h * 0.18;
        d.tx = d.x;
        d.ty = d.y;
      }
    }

    function resize() {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      world.field = layout(w, h);
      parkDinos();
      if (!world.started) {
        world.meteor.x = world.field.cx;
        world.meteor.y = world.field.cy;
      }
    }

    function launch(toward: Side) {
      const next = serve(world.field, toward, Math.random);
      Object.assign(world.meteor, next, { spin: (Math.random() - 0.5) * 0.3 });
      world.rally = 0;
      world.trail = [];
    }

    function restart() {
      const toward: Side = Math.random() < 0.5 ? 1 : -1;
      world.match = newMatch(toward);
      world.started = true;
      parkDinos();
      launch(toward);
    }

    // ---- input -----------------------------------------------------------
    const claim = (id: number | string, x: number, y: number) => {
      const d = world.dinos.find((p) => (y < h / 2 ? p.side === -1 : p.side === 1));
      if (d && d.touch === null) {
        d.touch = id;
        d.tx = x;
        d.ty = y;
      }
    };
    const tapAnywhere = () => {
      if (!world.started || world.match.phase === "end") restart();
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      tapAnywhere();
      for (const t of Array.from(e.changedTouches)) {
        claim(t.identifier, t.clientX, t.clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        for (const d of world.dinos) {
          if (d.touch === t.identifier) {
            d.tx = t.clientX;
            d.ty = t.clientY;
          }
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        for (const d of world.dinos) if (d.touch === t.identifier) d.touch = null;
      }
    };

    // Mouse is for trying it on a desktop; the game is meant for two thumbs.
    let mouseDown = false;
    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true;
      tapAnywhere();
      claim("mouse", e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return;
      for (const d of world.dinos) {
        if (d.touch === "mouse") {
          d.tx = e.clientX;
          d.ty = e.clientY;
        }
      }
    };
    const onMouseUp = () => {
      mouseDown = false;
      for (const d of world.dinos) if (d.touch === "mouse") d.touch = null;
    };

    // ---- simulation ------------------------------------------------------
    function decay(dt: number) {
      for (let i = world.trail.length - 1; i >= 0; i--) {
        world.trail[i].life -= dt;
        if (world.trail[i].life <= 0) world.trail.splice(i, 1);
      }
      for (let i = world.sparks.length - 1; i >= 0; i--) {
        const q = world.sparks[i];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.94;
        q.vy *= 0.94;
        q.life -= dt;
        if (q.life <= 0) world.sparks.splice(i, 1);
      }
      world.shake = world.shake > 0.3 ? world.shake * Math.pow(0.86, dt) : 0;
    }

    function scored(against: Side) {
      const m = world.meteor;
      burst(m.x, m.y, 30, PALETTE.lava, 9);
      burst(m.x, m.y, 18, PALETTE.ember, 12);
      world.shake = 16;
      buzz([30, 50, 60]);
      m.vx = 0;
      m.vy = 0;
      world.match = concede(world.match, against);
    }

    function step(dt: number) {
      const f = world.field;
      const m = world.meteor;

      for (const d of world.dinos) {
        const target = clampPaddle(f, d.side, { x: d.tx, y: d.ty });
        const px = d.x;
        const py = d.y;
        // Frame-rate independent easing toward the finger.
        const k = Math.min(1, (1 - Math.pow(0.001, dt / 60)) * 22);
        d.x += (target.x - d.x) * k;
        d.y += (target.y - d.y) * k;
        d.vx = (d.x - px) / dt;
        d.vy = (d.y - py) / dt;
        d.ang = Math.atan2(m.y - d.y, m.x - d.x) + Math.PI / 2;
        if (d.flash > 0) d.flash -= dt;
      }

      if (world.match.phase !== "play") {
        decay(dt);
        return;
      }

      const { min, max } = speedLimits(f, world.rally);
      // Substep so a fast meteor can't tunnel through a wall or a dino.
      const travel = Math.hypot(m.vx, m.vy) * dt;
      const steps = Math.max(1, Math.ceil(travel / (f.puckR * 0.8)));
      for (let s = 0; s < steps; s++) {
        const sub = dt / steps;
        m.x += m.vx * sub;
        m.y += m.vy * sub;

        const wall = bounceWalls(f, m);
        if (wall.conceded !== null) {
          scored(wall.conceded);
          return;
        }
        if (wall.hit) {
          burst(m.x, m.y, 4, PALETTE.ember, 3);
          world.shake = Math.max(world.shake, 2);
        }
        Object.assign(m, wall.puck);

        for (const d of world.dinos) {
          const hit = collide(f, m, d, world.rally);
          if (!hit) continue;
          const touching = f.puckR + f.paddleR;
          const nx = (hit.x - d.x) / touching;
          const ny = (hit.y - d.y) / touching;
          Object.assign(m, hit);
          m.spin = (d.vx * ny - d.vy * nx) * 0.02;
          world.rally++;
          d.flash = 12;
          world.shake = Math.max(world.shake, 3 + Math.min(1, world.rally / 10) * 5);
          burst(m.x, m.y, 8, PALETTE.lava, 5);
          buzz(10 + Math.round(Math.min(1, world.rally / 10) * 20));
        }
      }

      const speed = Math.hypot(m.vx, m.vy);
      if (speed > max) {
        m.vx *= max / speed;
        m.vy *= max / speed;
      } else if (speed < min) {
        const f2 = min / (speed || 0.001);
        m.vx *= f2;
        m.vy *= f2;
      }
      m.a += m.spin + speed * 0.012;
      world.trail.push({ x: m.x, y: m.y, life: 16 });
      decay(dt);
    }

    // ---- loop ------------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.max(0.2, Math.min(2.5, (now - last) / 16.667));
      last = now;
      world.frame++;

      // The title card is not a paused game: nothing advances until the
      // first tap, or the meteor would be away down the pitch by the time
      // anyone starts.
      if (world.started) {
        const before = world.match.phase;
        world.match = tick(world.match, dt);
        // The serve is launched when the countdown begins, so the only
        // transition that needs a new meteor is goal → serve.
        if (before === "goal" && world.match.phase === "serve") {
          launch(world.match.serveTo);
        }
        step(dt);
      }
      drawScene(ctx, world, labelsRef.current, w, h);
      raf = requestAnimationFrame(frame);
    };

    // ---- screen wake lock ------------------------------------------------
    let wakeLock: WakeLockSentinel | null = null;
    const keepAwake = async () => {
      try {
        if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* denied or unsupported — the game still plays */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void keepAwake();
    };

    resize();
    void keepAwake();
    raf = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    document.addEventListener("visibilitychange", onVisible);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      document.removeEventListener("visibilitychange", onVisible);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      void wakeLock?.release();
    };
  }, []);

  return <canvas ref={canvasRef} {...stylex.props(styles.canvas)} />;
}
