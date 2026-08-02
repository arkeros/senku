import * as stylex from "@stylexjs/stylex";
import { Outlet } from "react-router";
import { color, font } from "../../ui/theme/tokens.stylex";

/**
 * No chrome: the two halves fill the screen and each is read from a different
 * side of the table, so any shared header would be upside-down for someone.
 * The central ticket does the job a header normally would.
 */
const styles = stylex.create({
  booth: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    backgroundColor: color.booth,
    color: color.paper,
    fontFamily: font.mono,
    userSelect: "none",
    // A double-tap in a race must not be read as a zoom gesture.
    touchAction: "manipulation",
  },
});

export function Layout() {
  return (
    <div {...stylex.props(styles.booth)}>
      <Outlet />
    </div>
  );
}
