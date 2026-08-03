import * as stylex from "@stylexjs/stylex";

/**
 * The DOM-side half of the palette.
 *
 * This deliberately mirrors a handful of values from `render/palette.ts`
 * rather than importing them. The two cannot be one file: StyleX resolves
 * `stylex.create` values at build time and only understands `defineVars`
 * from a `.stylex.ts`, while canvas needs literal colour strings because
 * `ctx.fillStyle` cannot resolve a CSS custom property. Importing plain
 * constants into `stylex.create` fails the Babel pass outright.
 *
 * Only what the DOM actually paints lives here — the error page, the
 * not-found page and the table the plate sits on. Everything else is drawn.
 */
export const color = stylex.defineVars({
  night: "#14100D",
  bone: "#F4EEE2",
  tomato: "#E2452F",
  pesto: "#6FCF57",
});

export const font = stylex.defineVars({
  display: '"Archivo Black", Impact, "Arial Black", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "Courier New", monospace',
});
