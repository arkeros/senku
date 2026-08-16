import * as stylex from "@stylexjs/stylex";
import { Outlet } from "react-router";
import { color } from "../../ui/theme/tokens.stylex";

/**
 * No chrome at all. The board is a full-bleed canvas, and every label the
 * game shows is drawn inside it — a header would only steal rows from a grid
 * whose cells are already at the smallest size a thumb can hit.
 */
const styles = stylex.create({
  bar: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    backgroundColor: color.night,
    // Stops the browser reading a hold as a text selection, or a drag as
    // pull-to-refresh, mid-game.
    overscrollBehavior: "none",
    touchAction: "none",
    userSelect: "none",
    WebkitTouchCallout: "none",
  },
});

export function Layout() {
  return (
    <div {...stylex.props(styles.bar)}>
      <Outlet />
    </div>
  );
}
