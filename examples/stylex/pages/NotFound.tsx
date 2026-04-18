import * as stylex from "@stylexjs/stylex";
import { Link, useLocation } from "react-router";
import { color, font, size } from "../tokens.stylex";

const styles = stylex.create({
  wrap: {
    padding: size.m,
  },
  heading: {
    fontSize: 32,
    fontWeight: font.weight5,
    marginBottom: size.s,
  },
  link: {
    color: color.primary,
  },
});

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div {...stylex.props(styles.wrap)}>
      <h1 {...stylex.props(styles.heading)}>404</h1>
      <p>No route matched <code>{pathname}</code>.</p>
      <Link to="/" {...stylex.props(styles.link)}>Back home</Link>
    </div>
  );
}
