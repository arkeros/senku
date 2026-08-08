import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import {
  centerOf,
  eat,
  endRound,
  layout,
  newMatch,
  newSnakes,
  occupiedCells,
  refit,
  spawnFood,
  step,
  stepInterval,
  tick,
  turn,
  type Cell,
  type Dir,
  type Mode,
  type Seat,
} from "../../../game/rules";
import { PERSONAS, botDir, type PersonaId } from "../../../game/bot";
import { keyAction } from "../../../game/keys";
import { seatAt, swipeDir } from "../../../game/swipe";
import { PALETTE, SAUCES, sauceFor } from "../../../render/palette";
import {
  drawScene,
  hits,
  modeButtons,
  personaRows,
  type Labels,
  type Rect,
  type World,
} from "../../../render/scene";

type PlateProps = {
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

/** Solo high score. Namespaced because the origin serves only this app today. */
const BEST_KEY = "spaghetti-duel.best";

/**
 * The persona chosen last. Remembered so a rematch is two taps rather than a
 * decision — the roster opens with this row already marked.
 */
const PERSONA_KEY = "spaghetti-duel.persona";

const isPersona = (id: string | null): id is PersonaId =>
  id !== null && Object.prototype.hasOwnProperty.call(PERSONAS, id);

const between = (a: number, b: number) => a + Math.random() * (b - a);

/** One finger, from the moment it lands until it leaves. */
interface Track {
  readonly seat: Seat;
  x: number;
  y: number;
  /** Set once this finger has steered, which stops it also counting as a tap. */
  turned: boolean;
}

export function Plate({ labels }: PlateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads labels through a ref so a locale change never restarts the
  // game — the effect below is deliberately mounted once.
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;

    const readBest = () => {
      try {
        return Number(window.localStorage.getItem(BEST_KEY)) || 0;
      } catch {
        // Private mode, or storage disabled. A high score is a nicety.
        return 0;
      }
    };

    const readPersona = (): PersonaId | null => {
      try {
        const stored = window.localStorage.getItem(PERSONA_KEY);
        return isPersona(stored) ? stored : null;
      } catch {
        return null;
      }
    };

    const world: World = {
      board: layout(w, h),
      match: newMatch("solo"),
      mode: "solo",
      snakes: [],
      food: [],
      crumbs: [],
      slide: 0,
      shake: 0,
      frame: 0,
      screen: "title",
      // Remembered across sessions, and used before a match starts too: the
      // title card's bot button wears the last sauce played.
      bot: readPersona(),
      best: readBest(),
    };

    const buzz = (pattern: number | number[]) => {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* vibration is a nicety; a refusal is not an error */
      }
    };

    function burst(cell: Cell, col: string, n: number) {
      const { x, y } = centerOf(world.board, cell);
      const spread = world.board.cell * 0.22;
      for (let i = 0; i < n; i++) {
        world.crumbs.push({
          x,
          y,
          vx: between(-spread, spread),
          vy: between(-spread, spread),
          life: between(14, 26),
          r: between(0.1, 0.22) * world.board.cell,
          col,
        });
      }
    }

    // ---- setting the table -----------------------------------------------
    /** Frames banked toward the next move; see the loop at the bottom. */
    let acc = 0;

    /** Fresh strands and a first meatball. Runs before every round. */
    function deal() {
      world.board = layout(w, h);
      world.snakes = newSnakes(world.board, world.mode);
      const spot = spawnFood(world.board, occupiedCells(world.snakes), Math.random);
      world.food = spot ? [spot] : [];
      world.slide = 0;
      acc = 0;
    }

    /**
     * Start a match. `bot` is the controller on `top`, not a third mode — a
     * bot game is a duel with nobody in the far chair. See ADR 0001.
     */
    function begin(mode: Mode, bot: PersonaId | null = null) {
      world.mode = mode;
      world.bot = bot;
      world.match = newMatch(mode);
      world.screen = "game";
      world.crumbs = [];
      deal();
    }

    function rememberPersona(persona: PersonaId) {
      world.bot = persona;
      try {
        window.localStorage.setItem(PERSONA_KEY, persona);
      } catch {
        /* the roster still works; it just opens on nothing next time */
      }
    }

    function rememberBest() {
      if (world.match.eaten <= world.best) return;
      world.best = world.match.eaten;
      try {
        window.localStorage.setItem(BEST_KEY, String(world.best));
      } catch {
        /* nothing to be done, and nothing worth interrupting the game for */
      }
    }

    // ---- one move --------------------------------------------------------
    /**
     * The bot's turn, taken once per move and spent through `turn` exactly as
     * a flick is. It obeys the reversal rule and the queue cap because the
     * rulebook enforces them on everybody — `step` cannot tell which of its
     * two strands has a person behind it. See ADR 0001.
     */
    function think() {
      if (world.bot === null) return;
      const self = world.snakes.find((s) => s.seat === "top");
      if (!self || !self.alive) return;
      const foe = world.snakes.find((s) => s.seat === "bottom") ?? null;
      steer(
        "top",
        botDir({
          board: world.board,
          self,
          foe,
          food: world.food,
          traits: PERSONAS[world.bot],
        }),
      );
    }

    function move() {
      think();
      const out = step({
        board: world.board,
        snakes: world.snakes,
        food: world.food,
        random: Math.random,
      });
      world.snakes = out.snakes;
      world.food = out.food;

      for (const seat of out.ate) {
        world.match = eat(world.match);
        const head = out.snakes.find((s) => s.seat === seat)?.body[0];
        if (head) burst(head, PALETTE.meat, 9);
        buzz(12);
      }

      if (out.died.length === 0) return;

      for (const seat of out.died) {
        const crashed = out.snakes.find((s) => s.seat === seat);
        const sauce = seat === "top" && world.bot ? SAUCES[world.bot] : sauceFor(seat);
        if (crashed) burst(crashed.body[0], sauce.body, 20);
      }
      world.shake = 14;
      buzz([25, 40, 55]);
      world.match = endRound(world.match, out.died);
      if (world.mode === "solo") rememberBest();
    }

    // ---- input -----------------------------------------------------------
    const steer = (seat: Seat, dir: Dir) => {
      world.snakes = world.snakes.map((s) => (s.seat === seat ? turn(s, dir) : s));
    };

    /**
     * A tap, as opposed to a flick. Only the title card, the roster and the
     * game-over card listen: mid-round a stray tap must not do anything.
     */
    function tap(x: number, y: number) {
      if (world.screen === "title") {
        const buttons = modeButtons(w, h);
        if (hits(buttons.solo, x, y)) begin("solo");
        else if (hits(buttons.bot, x, y)) world.screen = "roster";
        else if (hits(buttons.duel, x, y)) begin("duel");
        return;
      }

      if (world.screen === "roster") {
        const { rows, back } = personaRows(w, h);
        // The way out is checked first: it must never be shadowed by a row.
        if (hits(back, x, y)) {
          world.screen = "title";
          return;
        }
        for (const [id, rect] of Object.entries(rows) as [PersonaId, Rect][]) {
          if (!hits(rect, x, y)) continue;
          rememberPersona(id);
          begin("duel", id);
          return;
        }
        return;
      }

      // Back to the title rather than straight into another game, so the
      // loser of a duel can switch to solo without reloading.
      if (world.match.phase === "end") world.screen = "title";
    }

    const tracks = new Map<number | string, Track>();

    const down = (id: number | string, x: number, y: number) => {
      // A bot in the far seat means one pair of thumbs, so the glass is not
      // split — every touch steers `bottom`, exactly as in solo.
      const seat = seatAt(y, h, world.mode, world.bot !== null);
      tracks.set(id, { seat, x, y, turned: false });
    };

    /**
     * Steer, and move the origin up to where the finger is now, so one long
     * drag can turn a corner and then turn again without being lifted.
     */
    const drag = (id: number | string, x: number, y: number) => {
      const track = tracks.get(id);
      if (!track) return;
      const dir = swipeDir(x - track.x, y - track.y);
      if (!dir) return;
      steer(track.seat, dir);
      track.x = x;
      track.y = y;
      track.turned = true;
    };

    const up = (id: number | string, x: number, y: number) => {
      const track = tracks.get(id);
      tracks.delete(id);
      if (track && !track.turned) tap(x, y);
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) down(t.identifier, t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) drag(t.identifier, t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) up(t.identifier, t.clientX, t.clientY);
    };

    // Mouse and keys are for trying it at a desk; the game wants thumbs.
    const onMouseDown = (e: MouseEvent) => down("mouse", e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => drag("mouse", e.clientX, e.clientY);
    const onMouseUp = (e: MouseEvent) => up("mouse", e.clientX, e.clientY);

    /**
     * Every key press is pushed through the drawn control it corresponds to,
     * rather than calling `begin` or setting `screen` directly. One set of
     * rules for a thumb and a keyboard is what stops the two drifting — which
     * is the bug this module was extracted to make visible in the first place.
     */
    const press = (rect: Rect) => tap(rect.x + rect.w / 2, rect.y + rect.h / 2);

    const onKeyDown = (e: KeyboardEvent) => {
      const action = keyAction(e.key, world.screen);
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case "steer":
          steer(action.seat, action.dir);
          return;
        case "start":
          press(modeButtons(w, h)[action.mode]);
          return;
        case "roster":
          press(modeButtons(w, h).bot);
          return;
        case "pick":
          press(personaRows(w, h).rows[action.persona]);
          return;
        case "back":
          press(personaRows(w, h).back);
          return;
        case "dismiss":
          if (world.match.phase === "end") world.screen = "title";
          return;
      }
    };

    // ---- frame -----------------------------------------------------------
    function decay(dt: number) {
      for (let i = world.crumbs.length - 1; i >= 0; i--) {
        const q = world.crumbs[i];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.9;
        q.vy *= 0.9;
        q.life -= dt;
        if (q.life <= 0) world.crumbs.splice(i, 1);
      }
      world.shake = world.shake > 0.3 ? world.shake * Math.pow(0.85, dt) : 0;
    }

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // Clamped: a backgrounded tab hands back a gap of seconds, and a strand
      // must never teleport across the plate because the phone locked.
      const dt = Math.max(0.2, Math.min(3, (now - last) / 16.667));
      last = now;
      world.frame++;

      if (world.screen === "game") {
        const before = world.match.phase;
        world.match = tick(world.match, dt);
        if (before === "round" && world.match.phase === "ready") deal();

        if (world.match.phase === "play") {
          acc += dt;
          let interval = stepInterval(world.match);
          while (acc >= interval && world.match.phase === "play") {
            acc -= interval;
            move();
            interval = stepInterval(world.match);
          }
          world.slide = world.match.phase === "play" ? Math.min(1, acc / interval) : 0;
        } else {
          acc = 0;
          world.slide = 0;
        }
      }

      decay(dt);
      drawScene(ctx, world, labelsRef.current, w, h);
      raf = requestAnimationFrame(frame);
    };

    function resize() {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Mid-game the grid is only rescaled, never re-cut — see `refit`.
      world.board = world.screen === "game" ? refit(world.board, w, h) : layout(w, h);
    }

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
    window.addEventListener("keydown", onKeyDown);
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
      window.removeEventListener("keydown", onKeyDown);
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
