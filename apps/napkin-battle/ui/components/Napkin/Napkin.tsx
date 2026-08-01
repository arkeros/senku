import * as stylex from "@stylexjs/stylex";
import { useMemo, type ReactNode } from "react";
import { color, shadow } from "../../theme/tokens.stylex";

type NapkinProps = {
  /** Cells per side. */
  size: number;
  /** Changing the seed redraws the pencil grid — one wobble per game. */
  seed: number;
  /** One {@link Cell} per square, in reading order. */
  children: ReactNode;
};

const styles = stylex.create({
  paper: {
    position: "relative",
    backgroundColor: color.paper,
    borderRadius: 4,
    padding: 16,
    // The napkin never lands square on the table.
    transform: "rotate(-0.7deg)",
    boxShadow: `${shadow.napkin}, 0 2px 0 ${color.paperEdge}`,
    "::before": {
      content: "",
      position: "absolute",
      inset: 7,
      borderWidth: 1,
      borderStyle: "dotted",
      borderColor: "rgba(0, 0, 0, 0.13)",
      borderRadius: 2,
      pointerEvents: "none",
    },
  },
  board: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    // Cancels the paper's tilt so the grid itself reads straight.
    transform: "rotate(0.7deg)",
  },
  lines: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none",
  },
  grid: {
    position: "absolute",
    inset: 0,
    display: "grid",
    gap: 0,
  },
  three: { gridTemplateColumns: "repeat(3, 1fr)" },
  four: { gridTemplateColumns: "repeat(4, 1fr)" },
});

/**
 * Deterministic PRNG so the wobble is stable across re-renders but different
 * per game. `Math.random` here would redraw the grid on every keystroke.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The grid as somebody would actually draw it on a napkin: every line a
 * quadratic curve between two slightly-missed endpoints, on a 0–100 viewBox.
 */
function pencilGrid(size: number, seed: number): string {
  const random = mulberry32(seed);
  const wobble = () => (random() - 0.5) * 1.1;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return (
      `M${x1 + wobble()} ${y1 + wobble()}` +
      ` Q${midX + wobble() * 2} ${midY + wobble() * 2}` +
      ` ${x2 + wobble()} ${y2 + wobble()}`
    );
  };

  let path = "";
  for (let i = 0; i <= size; i++) {
    const at = (i * 100) / size;
    path += line(0, at, 100, at) + line(at, 0, at, 100);
  }
  return path;
}

export function Napkin({ size, seed, children }: NapkinProps) {
  const path = useMemo(() => pencilGrid(size, seed), [size, seed]);
  return (
    <div {...stylex.props(styles.paper)}>
      <div {...stylex.props(styles.board)}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          {...stylex.props(styles.lines)}
        >
          <path
            d={path}
            fill="none"
            stroke="#3C4F49"
            strokeWidth={0.9}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        </svg>
        <div
          {...stylex.props(styles.grid, size === 3 ? styles.three : styles.four)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
