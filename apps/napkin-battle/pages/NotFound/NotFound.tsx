import * as stylex from "@stylexjs/stylex";
import { Link, useLocation } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font, radius, shadow, size } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  card: {
    marginTop: size.s,
    backgroundColor: color.paper,
    color: color.ink,
    borderRadius: radius.sm,
    padding: size.m,
    transform: "rotate(0.6deg)",
    boxShadow: shadow.napkin,
  },
  heading: {
    marginTop: 0,
    marginBottom: size.xs,
    fontFamily: font.written,
    fontSize: 32,
    fontWeight: font.weight7,
  },
  body: {
    margin: 0,
    fontSize: 13,
    lineHeight: font.lineHeight3,
  },
  back: {
    display: "inline-block",
    marginTop: size.s,
    color: color.chalk,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
});

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <>
      <div {...stylex.props(styles.card)}>
        <h2 {...stylex.props(styles.heading)}>
          <Trans id="notFound.heading" />
        </h2>
        <p {...stylex.props(styles.body)}>
          <Trans id="notFound.body" values={{ pathname }} />
        </p>
      </div>
      <Link to="/" {...stylex.props(styles.back)}>
        <Trans id="notFound.back" />
      </Link>
    </>
  );
}
