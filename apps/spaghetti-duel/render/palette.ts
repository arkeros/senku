import type { PersonaId } from "../game/bot.js";
import type { Seat } from "../game/rules.js";

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

/**
 * The five bot sauces.
 *
 * A persona replaces the top seat's colour as well as its name, so you can see
 * which sauce you are duelling from any frame — including the plate's own
 * wash, which tints the far half toward whoever is on it.
 *
 * Two of these are deliberately not the colour of the thing they are named
 * after, and both would be bugs if they were:
 *
 * - **Ketchup** is pulled deeper and bluer than a squeeze bottle, because the
 *   meatballs are `#B0552C` with a `#E8946A` shine and a literal tomato red
 *   competes with them at a 14px cell. A strand you can mistake for food is a
 *   strand that costs rounds.
 * - **Mayonesa** is warm cream rather than white, because `bone` is the score,
 *   the countdown and every card. A near-white strand is beautifully legible
 *   against the plate and then indistinguishable from the HUD sitting on it.
 *
 * Alioli sits between them and is yellower and greener than mayo — it has
 * garlic in it, mayo does not. The two never share a plate, since only one
 * bot ever occupies a seat, but they sit two rows apart on the roster.
 */
export const SAUCES: Readonly<Record<PersonaId, Sauce>> = {
  ketchup: {
    body: "#D93A3A",
    dark: "#6E1B1B",
    light: "#F5B9B9",
    wash: "rgba(217,58,58,.07)",
  },
  mayo: {
    body: "#EBD9A8",
    dark: "#7A6C42",
    light: "#F8EFD4",
    wash: "rgba(235,217,168,.07)",
  },
  alioli: {
    body: "#DCCB72",
    dark: "#6E6220",
    light: "#F2E9B8",
    wash: "rgba(220,203,114,.07)",
  },
  brava: {
    body: "#E8722B",
    dark: "#7A3308",
    light: "#FBC79B",
    wash: "rgba(232,114,43,.07)",
  },
  kamikaze: {
    body: "#C4472E",
    dark: "#631E12",
    light: "#F0AD9B",
    wash: "rgba(196,71,46,.07)",
  },
};

/**
 * The sauce for a seat with a person in it.
 *
 * Position decides the colour only while both seats are human. When a bot
 * holds one, its persona brings its own — see `SAUCES` and ADR 0001.
 */
export const sauceFor = (seat: Seat): Sauce => (seat === "bottom" ? PESTO : CARBONARA);

/**
 * Neither typeface is fetched over the network — the plate has to look the
 * same offline, and a canvas that draws before a webfont loads renders the
 * fallback anyway with no reflow to fix it afterwards. The named families are
 * kept first so the design still lands if they're ever installed locally.
 */
export const DISPLAY_FONT = '"Archivo Black", Impact, "Arial Black", sans-serif';
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "Courier New", monospace';
