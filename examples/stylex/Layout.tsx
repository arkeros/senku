import * as stylex from "@stylexjs/stylex";
import { Link, Outlet } from "react-router";
import { color, font, size } from "./tokens.stylex";

const styles = stylex.create({
  layout: {
    fontFamily: font.sans,
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    gap: size.s,
    padding: size.s,
    borderBottom: `1px solid ${color.border}`,
  },
  link: {
    color: color.primary,
    textDecoration: "none",
    fontWeight: font.weight5,
  },
  content: {
    padding: size.m,
  },
});

export function Layout() {
  return (
    <div {...stylex.props(styles.layout)}>
      <nav {...stylex.props(styles.nav)}>
        <Link to="/" {...stylex.props(styles.link)}>Home</Link>
        <Link to="/about" {...stylex.props(styles.link)}>About</Link>
        <Link to="/concerts" {...stylex.props(styles.link)}>Concerts</Link>
      </nav>
      <main {...stylex.props(styles.content)}>
        <Outlet />
      </main>
    </div>
  );
}
