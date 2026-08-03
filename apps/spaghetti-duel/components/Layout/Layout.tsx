import * as stylex from "@stylexjs/stylex";
import { Outlet } from "react-router";
import { color } from "../../ui/theme/tokens.stylex";

/**
 * No chrome at all. The plate is a full-bleed canvas that two people lean
 * over from opposite sides of a table, so a header or a nav bar would only
 * be upside-down for one of them — every label the game shows is drawn
 * inside the canvas instead, once per seat.
 */
const styles = stylex.create({
  table: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    backgroundColor: color.night,
    // Stops the browser treating a flick as pull-to-refresh mid-round.
    overscrollBehavior: "none",
    touchAction: "none",
    userSelect: "none",
  },
});

export function Layout() {
  return (
    <div {...stylex.props(styles.table)}>
      <Outlet />
    </div>
  );
}
