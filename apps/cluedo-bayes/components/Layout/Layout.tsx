import * as stylex from "@stylexjs/stylex";
import { Outlet } from "react-router";
import { color } from "../../ui/theme/tokens.stylex";

/**
 * A scrolling document, unlike the other three games: this one is a case file
 * you read down, not a board two people lean over, so it keeps normal page
 * scrolling and normal pinch-zoom.
 */
const styles = stylex.create({
  desk: { minHeight: "100vh", backgroundColor: color.bg },
});

export function Layout() {
  return (
    <div {...stylex.props(styles.desk)}>
      <Outlet />
    </div>
  );
}
