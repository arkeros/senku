import * as stylex from "@stylexjs/stylex";

/**
 * A late-night diner booth: dark green vinyl, cream till-roll paper, and the
 * two condiments the players are named after.
 */
export const color = stylex.defineVars({
  booth: "#0E1A17",
  boothSeat: "#132723",
  boothDark: "#0B120F",
  boothDim: "#0A1210",
  paper: "#E9DFC7",
  muted: "#6E8B80",
  /** Player colours: mustard sits at the top, chilli at the bottom. */
  mustard: "#F5B72E",
  chilli: "#FF4D5E",
  /** The "go" flash on a reflex round. */
  green: "#3FBF7F",
});

/**
 * Stroop ink colours. Separate from the palette above because these are the
 * *content* of a challenge, not chrome — the four names the generator picks
 * between, and they must stay recognisable as red/blue/green/yellow.
 */
export const ink = stylex.defineVars({
  red: "#FF4D5E",
  blue: "#5B8CFF",
  green: "#3FBF7F",
  yellow: "#F5B72E",
});

export const font = stylex.defineVars({
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace',
});
