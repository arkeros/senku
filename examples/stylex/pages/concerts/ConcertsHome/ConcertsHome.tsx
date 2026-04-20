import * as stylex from "@stylexjs/stylex";
import { Link } from "react-router";
import { Trans } from "@panellet/i18n-runtime";

const styles = stylex.create({
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  link: { color: "royalblue", textDecoration: "underline" },
});

export function ConcertsHome() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="concerts.home.heading" />
      </h1>
      <div {...stylex.props(styles.list)}>
        <Link to="trending" {...stylex.props(styles.link)}>
          <Trans id="concerts.home.link.trending" />
        </Link>
        <Link to="barcelona" {...stylex.props(styles.link)}>
          <Trans id="concerts.home.link.barcelona" />
        </Link>
        <Link to="madrid" {...stylex.props(styles.link)}>
          <Trans id="concerts.home.link.madrid" />
        </Link>
      </div>
    </div>
  );
}
