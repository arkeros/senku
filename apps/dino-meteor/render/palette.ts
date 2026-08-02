import type { Seat } from "../game/rules";

/**
 * Volcanic palette.
 *
 * Plain strings rather than StyleX tokens: these are handed straight to
 * `ctx.fillStyle`, and canvas cannot resolve CSS custom properties. The one
 * value the DOM also needs (the page background) is repeated in
 * `index.html.tpl`, because it has to cover the overscroll area that no
 * element inside `<body>` can reach.
 */
export const PALETTE = {
  night: "#0C0718",
  basalt: "#191029",
  line: "rgba(243,231,208,.16)",
  bone: "#F3E7D0",
  lava: "#FFC24B",
  ember: "#F2762E",
} as const;

export interface DinoSkin {
  readonly body: string;
  readonly dark: string;
  readonly light: string;
  /** Tint washed over that player's half of the arena. */
  readonly wash: string;
}

/** The player at the bottom of the screen. */
export const REX: DinoSkin = {
  body: "#4FD48A",
  dark: "#1B7A50",
  light: "#B7F5D3",
  wash: "rgba(79,212,138,.10)",
};

/** The player at the top of the screen. */
export const TRIKE: DinoSkin = {
  body: "#FF8A4C",
  dark: "#B33B1E",
  light: "#FFD2AE",
  wash: "rgba(255,138,76,.10)",
};

export const skinFor = (seat: Seat): DinoSkin => (seat === "bottom" ? REX : TRIKE);

/**
 * Neither typeface is fetched over the network — the arena has to look the
 * same offline, and a canvas that draws before a webfont loads renders the
 * fallback anyway with no reflow to fix it afterwards. The named families are
 * kept first so the design still lands if they're ever installed locally.
 */
export const DISPLAY_FONT = '"Archivo Black", Impact, "Arial Black", sans-serif';
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "Courier New", monospace';
