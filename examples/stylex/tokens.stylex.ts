import * as stylex from "@stylexjs/stylex";

/**
 * Design tokens backed by Open Props CSS custom properties.
 *
 * Open Props provides the values (loaded as a CSS file in the HTML head).
 * StyleX provides type safety, build-time validation, and atomic CSS output.
 *
 * Usage:
 *   import { color, size, radius, font, shadow } from "./tokens.stylex";
 *
 *   const styles = stylex.create({
 *     button: { fontSize: font.size2, borderRadius: radius.md, padding: size.s },
 *   });
 */

export const color = stylex.defineVars({
  primary: "var(--indigo-7)",
  primaryLight: "var(--indigo-3)",
  primaryDark: "var(--indigo-9)",
  secondary: "var(--gray-7)",
  secondaryLight: "var(--gray-3)",
  surface: "var(--gray-0)",
  text: "var(--gray-9)",
  textMuted: "var(--gray-6)",
  white: "#fff",
  transparent: "transparent",
  border: "var(--gray-3)",
});

export const size = stylex.defineVars({
  xxs: "var(--size-1)",
  xs: "var(--size-2)",
  s: "var(--size-3)",
  m: "var(--size-5)",
  l: "var(--size-7)",
  xl: "var(--size-9)",
});

export const radius = stylex.defineVars({
  sm: "var(--radius-2)",
  md: "var(--radius-3)",
  lg: "var(--radius-4)",
  round: "var(--radius-round)",
});

export const font = stylex.defineVars({
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
  size1: "var(--font-size-1)",
  size2: "var(--font-size-2)",
  size3: "var(--font-size-3)",
  size4: "var(--font-size-4)",
  size5: "var(--font-size-5)",
  weight4: "var(--font-weight-4)",
  weight5: "var(--font-weight-5)",
  weight7: "var(--font-weight-7)",
  lineHeight3: "var(--font-lineheight-3)",
});

export const shadow = stylex.defineVars({
  sm: "var(--shadow-1)",
  md: "var(--shadow-2)",
  lg: "var(--shadow-3)",
});

export const ease = stylex.defineVars({
  out3: "var(--ease-out-3)",
  out5: "var(--ease-out-5)",
  elastic3: "var(--ease-elastic-3)",
});
