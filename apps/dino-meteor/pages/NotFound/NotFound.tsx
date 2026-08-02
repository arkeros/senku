import * as stylex from "@stylexjs/stylex";
import { Link } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  crater: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    textAlign: "center",
    color: color.bone,
    fontFamily: font.mono,
  },
  heading: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "clamp(28px, 9vw, 52px)",
    color: color.lava,
  },
  back: {
    color: color.ember,
    fontSize: 12,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
});

export function NotFound() {
  return (
    <div {...stylex.props(styles.crater)}>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="notFound.heading" />
      </h1>
      <p>
        <Trans id="notFound.body" />
      </p>
      <Link to="/" {...stylex.props(styles.back)}>
        <Trans id="notFound.back" />
      </Link>
    </div>
  );
}
