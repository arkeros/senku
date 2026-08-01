import * as stylex from "@stylexjs/stylex";
import { Link } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  wrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    textAlign: "center",
    color: color.paper,
    fontFamily: font.mono,
  },
  heading: {
    margin: 0,
    fontSize: "clamp(1.3rem, 6vmin, 2rem)",
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: color.mustard,
  },
  body: { margin: 0, fontSize: 13, color: color.muted },
  back: {
    color: color.chilli,
    fontSize: 11,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
});

export function NotFound() {
  return (
    <div {...stylex.props(styles.wrap)}>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="notFound.heading" />
      </h1>
      <p {...stylex.props(styles.body)}>
        <Trans id="notFound.body" />
      </p>
      <Link to="/" {...stylex.props(styles.back)}>
        <Trans id="notFound.back" />
      </Link>
    </div>
  );
}
