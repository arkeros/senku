import * as stylex from "@stylexjs/stylex";
import { Link, Outlet } from "react-router";

const styles = stylex.create({
  layout: {
    fontFamily: "system-ui, sans-serif",
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    gap: 16,
    padding: 16,
    borderBottom: "1px solid #e0e0e0",
  },
  link: {
    color: "royalblue",
    textDecoration: "none",
    fontWeight: 500,
  },
  content: {
    padding: 24,
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
