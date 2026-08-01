import * as stylex from "@stylexjs/stylex";

/**
 * Design tokens for the napkin.
 *
 * Spacing, radii and shadows come from Open Props (loaded as CSS custom
 * properties in the document head); the palette is bespoke, because the whole
 * point is a specific bar table with a specific paper napkin on it, not a
 * generic indigo-on-white app.
 */

export const color = stylex.defineVars({
  /** The bar table the napkin is lying on. */
  table: "#16322D",
  tableDeep: "#0D211E",
  /** The napkin, and the shadow it casts on itself. */
  paper: "#F7F3E8",
  paperEdge: "#E2DBC9",
  /** The two pens. */
  blue: "#2440B5",
  red: "#C4362E",
  /** Text on the table (chalk) and on the paper (ink). */
  chalk: "#B9C6BE",
  graphite: "#5E6F67",
  ink: "#22302B",
  /** Pencil-drawn grid lines. */
  pencil: "#3C4F49",
  transparent: "transparent",
});

export const size = stylex.defineVars({
  xxs: "var(--size-1)",
  xs: "var(--size-2)",
  s: "var(--size-3)",
  m: "var(--size-5)",
  l: "var(--size-7)",
});

export const radius = stylex.defineVars({
  sm: "var(--radius-2)",
  md: "var(--radius-3)",
  round: "var(--radius-round)",
});

export const font = stylex.defineVars({
  /**
   * Two typefaces, both from the local system stack so the napkin renders the
   * same offline as online: a typewriter face for everything printed (labels,
   * the bill) and a cursive face for what the players write by hand.
   */
  typed: 'var(--font-mono, "Courier New", monospace)',
  written: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  size0: "var(--font-size-0)",
  size1: "var(--font-size-1)",
  size2: "var(--font-size-2)",
  weight4: "var(--font-weight-4)",
  weight7: "var(--font-weight-7)",
  lineHeight3: "var(--font-lineheight-3)",
});

export const shadow = stylex.defineVars({
  napkin: "0 18px 34px rgba(0, 0, 0, 0.42)",
  bill: "0 12px 26px rgba(0, 0, 0, 0.34)",
});
