import * as stylex from "@stylexjs/stylex";
import { Link } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font, radius, shadow, size } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  card: {
    marginTop: size.s,
    backgroundColor: color.paper,
    color: color.ink,
    borderRadius: radius.sm,
    padding: size.m,
    transform: "rotate(-0.4deg)",
    boxShadow: shadow.napkin,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: size.s,
    fontSize: 13,
    lineHeight: font.lineHeight3,
  },
  last: {
    marginBottom: 0,
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

export function HowToPlay() {
  return (
    <>
      <article {...stylex.props(styles.card)}>
        <p {...stylex.props(styles.paragraph)}>
          <Trans id="howToPlay.tiles" />
        </p>
        <p {...stylex.props(styles.paragraph)}>
          <Trans id="howToPlay.scoring" />
        </p>
        <p {...stylex.props(styles.paragraph)}>
          <Trans id="howToPlay.extremes" />
        </p>
        <p {...stylex.props(styles.paragraph)}>
          <Trans id="howToPlay.stain" />
        </p>
        <p {...stylex.props(styles.paragraph, styles.last)}>
          <Trans id="howToPlay.ending" />
        </p>
      </article>
      <Link to="/" {...stylex.props(styles.back)}>
        <Trans id="howToPlay.back" />
      </Link>
    </>
  );
}
