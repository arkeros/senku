import type { Seat } from "../game/rules";

/**
 * Trattoria palette.
 *
 * Plain strings rather than StyleX tokens: these are handed straight to
 * `ctx.fillStyle`, and canvas cannot resolve CSS custom properties. The one
 * value the DOM also needs (the page background) is repeated in
 * `index.html.tpl`, because it has to cover the overscroll area that no
 * element inside `<body>` can reach.
 */
export const PALETTE = {
  /** The table the plate sits on. */
  night: "#14100D",
  /** The plate itself. */
  plate: "#1F1916",
  rim: "rgba(244,238,226,.13)",
  grid: "rgba(244,238,226,.045)",
  bone: "#F4EEE2",
  tomato: "#E2452F",
  meat: "#B0552C",
  meatDark: "#66301A",
  meatShine: "#E8946A",
} as const;

export interface Sauce {
  readonly body: string;
  readonly dark: string;
  readonly light: string;
  /** Tint washed over that player's half of the plate in a duel. */
  readonly wash: string;
}

/** The player at the bottom of the screen. */
export const PESTO: Sauce = {
  body: "#6FCF57",
  dark: "#2B6E28",
  light: "#CBF5BB",
  wash: "rgba(111,207,87,.07)",
};

/** The player at the top of the screen. */
export const CARBONARA: Sauce = {
  body: "#F5C542",
  dark: "#8F640E",
  light: "#FFEBB0",
  wash: "rgba(245,197,66,.07)",
};

export const sauceFor = (seat: Seat): Sauce => (seat === "bottom" ? PESTO : CARBONARA);

/**
 * Neither typeface is fetched over the network — the plate has to look the
 * same offline, and a canvas that draws before a webfont loads renders the
 * fallback anyway with no reflow to fix it afterwards. The named families are
 * kept first so the design still lands if they're ever installed locally.
 */
export const DISPLAY_FONT = '"Archivo Black", Impact, "Arial Black", sans-serif';
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "Courier New", monospace';
