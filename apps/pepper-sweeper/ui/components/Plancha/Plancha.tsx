import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { cellAt, centerOf, layout, refit } from "../../../game/board";
import {
  chord,
  layPeppers,
  pick,
  relayAround,
  reveal,
  swept,
  toggleFlag,
  type Opening,
} from "../../../game/field";
import { HOLD_MS, holdVerdict, isTap, startKey } from "../../../game/input";
import {
  CELLS_ACROSS,
  finish,
  newMatch,
  passTurn,
  peppersFor,
  scored,
  seconds,
  tick,
  touch,
  type Mode,
} from "../../../game/match";
import { PALETTE, sauceFor } from "../../../render/palette";
import { drawScene, hits, modeButtons, type Labels, type World } from "../../../render/scene";

type PlanchaProps = {
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

/** Fastest solo sweep. Namespaced because the origin serves only this app today. */
const BEST_KEY = "pepper-sweeper.best";

const between = (a: number, b: number) => a + Math.random() * (b - a);

/** One finger, from the moment it lands until it leaves. */
interface Track {
  /** The cell it landed on, or null for a press beside the board. */
  readonly cell: number | null;
  readonly startX: number;
  readonly startY: number;
  readonly at: number;
  moved: number;
  /** Set once this press has planted a flag, which stops it also revealing. */
  flagged: boolean;
}

export function Plancha({ labels }: PlanchaProps) {
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
        // Private mode, or storage disabled. A record is a nicety.
        return 0;
      }
    };

    const firstBoard = layout(w, h, CELLS_ACROSS.solo);
    const world: World = {
      board: firstBoard,
      field: layPeppers(firstBoard.cols, firstBoard.rows, 0, Math.random),
      match: newMatch("solo"),
      mode: "solo",
      press: null,
      sparks: [],
      shake: 0,
      frame: 0,
      started: false,
      best: readBest(),
    };

    const buzz = (pattern: number | number[]) => {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* vibration is a nicety; a refusal is not an error */
      }
    };

    function burst(i: number, col: string, n: number) {
      const { x, y } = centerOf(world.board, i % world.board.cols, Math.floor(i / world.board.cols));
      const spread = world.board.cell * 0.2;
      for (let k = 0; k < n; k++) {
        world.sparks.push({
          x,
          y,
          vx: between(-spread, spread),
          vy: between(-spread, spread),
          life: between(12, 22),
          r: between(0.06, 0.16) * world.board.cell,
          col,
        });
      }
    }

    // ---- setting the board -----------------------------------------------
    function begin(mode: Mode) {
      const board = layout(w, h, CELLS_ACROSS[mode]);
      world.mode = mode;
      world.board = board;
      world.field = layPeppers(
        board.cols,
        board.rows,
        peppersFor(mode, board),
        Math.random,
      );
      world.match = newMatch(mode);
      world.sparks = [];
      world.press = null;
      world.started = true;
    }

    function rememberBest() {
      const took = seconds(world.match);
      if (world.best > 0 && took >= world.best) return;
      world.best = took;
      try {
        window.localStorage.setItem(BEST_KEY, String(took));
      } catch {
        /* nothing to be done, and nothing worth interrupting the game for */
      }
    }

    // ---- a solo move -----------------------------------------------------
    /** Apply whatever a reveal or a chord turned up. */
    function settle(out: Opening) {
      world.field = out.field;
      // A big flood is its own spectacle; sparks are for the deliberate ones.
      if (out.opened.length > 0 && out.opened.length <= 3) {
        for (const j of out.opened) burst(j, PALETTE.tileLip, 3);
      }

      if (out.bitten !== null) {
        burst(out.bitten, PALETTE.ember, 22);
        world.shake = 16;
        buzz([30, 50, 70]);
        world.match = finish(world.match, "bitten");
        return;
      }
      if (swept(world.field)) {
        world.match = finish(world.match, "swept");
        buzz([20, 60, 20]);
        rememberBest();
      }
    }

    function soloTap(i: number) {
      const tile = world.field.tiles[i];
      // A tap on an open number chords it — the only thing left to do to a
      // tile that is already face up, and the difference between finishing a
      // board with a thumb and finishing it one cell at a time.
      if (tile.kind === "revealed") {
        settle(chord(world.field, i));
        return;
      }
      if (tile.kind !== "hidden") return;

      // The first tap is never a coin toss: the peppers are laid around it.
      if (!world.match.touched) {
        world.field = relayAround(world.field, i, Math.random);
        world.match = touch(world.match);
      }
      settle(reveal(world.field, i));
    }

    function soloFlag(i: number) {
      const before = world.field;
      world.field = toggleFlag(world.field, i);
      if (world.field !== before) buzz(14);
    }

    // ---- a duel move -----------------------------------------------------
    function duelTap(i: number) {
      const side = world.match.turn;
      const out = pick(world.field, i, side);
      world.field = out.field;

      if (out.got) {
        burst(i, sauceFor(side).body, 14);
        buzz(18);
        world.match = scored(world.match, side);
        if (world.match.winner !== null) {
          world.shake = 12;
          buzz([25, 50, 25]);
        }
        return;
      }
      // Only a move that actually turned something over costs the go; a tap
      // on a tile that was already face up is a misfire, not a turn.
      if (out.opened.length > 0) {
        world.match = passTurn(world.match);
        buzz(8);
      }
    }

    // ---- input -----------------------------------------------------------
    /**
     * A tap, as opposed to a hold. Only the title card and the end card
     * listen off the board: mid-game a tap beside the grid does nothing.
     */
    function tapAt(track: Track, x: number, y: number) {
      if (!world.started) {
        const buttons = modeButtons(w, h);
        if (hits(buttons.solo, x, y)) begin("solo");
        else if (hits(buttons.duel, x, y)) begin("duel");
        return;
      }
      // Back to the title rather than straight into another game, so the
      // loser of a duel can switch to solo without reloading.
      if (world.match.phase === "end") {
        world.started = false;
        return;
      }
      if (track.cell === null) return;
      if (world.mode === "duel") duelTap(track.cell);
      else soloTap(track.cell);
    }

    let track: Track | null = null;

    /** Only a solo player mid-game has anything to hold for. */
    const canFlag = () =>
      world.started && world.mode === "solo" && world.match.phase === "play";

    const down = (x: number, y: number) => {
      const cell = world.started ? cellAt(world.board, x, y) : null;
      track = {
        cell: cell ? cell.row * world.board.cols + cell.col : null,
        startX: x,
        startY: y,
        at: performance.now(),
        moved: 0,
        flagged: false,
      };
    };

    const drag = (x: number, y: number) => {
      if (!track) return;
      track.moved = Math.max(track.moved, Math.hypot(x - track.startX, y - track.startY));
    };

    const up = (x: number, y: number) => {
      const lifted = track;
      track = null;
      world.press = null;
      if (!lifted || lifted.flagged) return;
      if (isTap(performance.now() - lifted.at, lifted.moved)) tapAt(lifted, x, y);
    };

    /**
     * The hold is judged on the frame rather than on an event, because there
     * is no event for "a finger has now been still for long enough" — and it
     * is what feeds the ring the renderer draws under the finger.
     */
    function watchHold(now: number) {
      world.press = null;
      if (!track || track.flagged || track.cell === null || !canFlag()) return;

      const held = now - track.at;
      const verdict = holdVerdict(held, track.moved);
      if (verdict === "cancelled") return;
      if (verdict === "flag") {
        soloFlag(track.cell);
        track.flagged = true;
        return;
      }
      world.press = { cell: track.cell, progress: Math.min(1, held / HOLD_MS) };
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      // One board, one finger: a second thumb mid-press would otherwise
      // retarget the hold onto a cell the first one never touched.
      if (track) return;
      const t = e.changedTouches[0];
      if (t) down(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) drag(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) up(t.clientX, t.clientY);
    };

    const onMouseDown = (e: MouseEvent) => down(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => drag(e.clientX, e.clientY);
    const onMouseUp = (e: MouseEvent) => up(e.clientX, e.clientY);

    /** At a desk the right button is the flag, as it is in every minesweeper. */
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const held = track;
      track = null;
      world.press = null;
      // A touchscreen may raise this for the very long press the frame loop
      // has already answered. Marking a second time would unmark, so a press
      // that has flagged already is left alone.
      if (held?.flagged || !canFlag()) return;
      const cell = cellAt(world.board, e.clientX, e.clientY);
      if (cell) soloFlag(cell.row * world.board.cols + cell.col);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mode = startKey(e.key);
      if (!mode) return;
      e.preventDefault();
      // Press the drawn button rather than call `begin` directly, so a key and
      // a thumb go through one set of rules: only the title card starts a
      // game, and the end card reads any press as "back to the title".
      const button = modeButtons(w, h)[mode];
      const centre = { x: button.x + button.w / 2, y: button.y + button.h / 2 };
      tapAt({ cell: null, startX: 0, startY: 0, at: 0, moved: 0, flagged: false }, centre.x, centre.y);
    };

    // ---- frame -----------------------------------------------------------
    function decay(dt: number) {
      for (let i = world.sparks.length - 1; i >= 0; i--) {
        const s = world.sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.88;
        s.vy *= 0.88;
        s.life -= dt;
        if (s.life <= 0) world.sparks.splice(i, 1);
      }
      world.shake = world.shake > 0.3 ? world.shake * Math.pow(0.85, dt) : 0;
    }

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // Clamped: a backgrounded tab hands back a gap of seconds, and a solo
      // clock must not jump a minute because the phone locked.
      const dt = Math.max(0.2, Math.min(3, (now - last) / 16.667));
      last = now;
      world.frame++;

      if (world.started) {
        world.match = tick(world.match, dt);
        watchHold(now);
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
      world.board = world.started
        ? refit(world.board, w, h)
        : layout(w, h, CELLS_ACROSS[world.mode]);
    }

    // ---- screen wake lock ------------------------------------------------
    // A minesweeper board is stared at, not swiped at. Without this the screen
    // dims in the middle of the one part of the game that takes thinking.
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
    canvas.addEventListener("contextmenu", onContextMenu);
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
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mouseup", onMouseUp);
      void wakeLock?.release();
    };
  }, []);

  return <canvas ref={canvasRef} {...stylex.props(styles.canvas)} />;
}
