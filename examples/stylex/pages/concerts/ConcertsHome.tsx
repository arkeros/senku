import * as stylex from "@stylexjs/stylex";
import { Link } from "react-router";

const styles = stylex.create({
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  link: { color: "royalblue", textDecoration: "underline" },
});

export function ConcertsHome() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>Concerts</h1>
      <div {...stylex.props(styles.list)}>
        <Link to="trending" {...stylex.props(styles.link)}>Trending</Link>
        <Link to="barcelona" {...stylex.props(styles.link)}>Barcelona</Link>
        <Link to="madrid" {...stylex.props(styles.link)}>Madrid</Link>
      </div>
    </div>
  );
}
