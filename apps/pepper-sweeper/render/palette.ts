import type { Side } from "../game/field";

/**
 * Plancha palette — a hot iron griddle on a dark bar top.
 *
 * Plain strings rather than StyleX tokens: these are handed straight to
 * `ctx.fillStyle`, and canvas cannot resolve CSS custom properties. The one
 * value the DOM also needs (the page background) is repeated in
 * `index.html.tpl`, because it has to cover the overscroll area that no
 * element inside `<body>` can reach.
 */
export const PALETTE = {
  /** The bar the griddle sits on. */
  night: "#0E1113",
  /** The griddle itself, under the tiles. */
  plate: "#171B1E",
  /** An unturned tile, and the two edges that make it look raised. */
  tile: "#2A3035",
  tileLip: "#3E474D",
  tileShade: "#171B1E",
  /** A tile that has been turned over. */
  open: "#191D20",
  rim: "rgba(233,238,240,.13)",
  grid: "rgba(233,238,240,.05)",
  bone: "#E9EEF0",
  /** Heat: the pepper that bit, and everything that goes wrong. */
  ember: "#E2452F",
  emberGlow: "rgba(226,69,47,.16)",
  /** A padrón pepper looks the same whether it stings or not — the joke. */
  pepper: "#5FA83C",
  pepperDark: "#2C5F1D",
  pepperLight: "#A8DE7C",
  stalk: "#8A7A3C",
} as const;

/**
 * How many peppers a cell touches, by count. Index 0 is never drawn — an
 * empty cell shows nothing at all, which is what makes a cleared region read
 * as one shape instead of a field of zeroes.
 *
 * Near enough to the colours every minesweeper has used since 1990 to be
 * legible to anyone who has played one, lifted off the dark ground.
 */
export const NEAR_COLORS: readonly string[] = [
  "",
  "#6BB4F0",
  "#7BD08A",
  "#F0806B",
  "#B58BF0",
  "#F0C56B",
  "#5FD8D0",
  "#E9EEF0",
  "#98A4AA",
];

export interface Sauce {
  readonly body: string;
  readonly dark: string;
  readonly light: string;
  /** Tint washed behind that player's score while it is their go. */
  readonly wash: string;
}

/**
 * The two players are the two sauces every tapas bar puts on a table. Their
 * lightness is deliberately far apart, not just their hue: the cocktail
 * sticks marking claimed peppers are small, and hue alone is not something
 * every player can rely on.
 */
export const BRAVA: Sauce = {
  body: "#E8553A",
  dark: "#7A2416",
  light: "#FFAE94",
  wash: "rgba(232,85,58,.10)",
};

export const ALIOLI: Sauce = {
  body: "#F0E3AE",
  dark: "#8A7A3C",
  light: "#FFF9E2",
  wash: "rgba(240,227,174,.09)",
};

export const sauceFor = (side: Side): Sauce => (side === "left" ? BRAVA : ALIOLI);

/**
 * Neither typeface is fetched over the network — the board has to look the
 * same offline, and a canvas that draws before a webfont loads renders the
 * fallback anyway with no reflow to fix it afterwards. The named families are
 * kept first so the design still lands if they're ever installed locally.
 */
export const DISPLAY_FONT = '"Archivo Black", Impact, "Arial Black", sans-serif';
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "Courier New", monospace';
