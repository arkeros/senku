import * as stylex from "@stylexjs/stylex";
import { Trans } from "@panallet/i18n-runtime";
import { color, font, size } from "../tokens.stylex";

const styles = stylex.create({
  heading: {
    fontSize: font.size4,
    fontWeight: font.weight7,
    marginBottom: size.s,
  },
  text: {
    fontSize: font.size2,
    lineHeight: font.lineHeight3,
    color: color.textMuted,
  },
});

export function About() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}><Trans id="about.heading" /></h1>
      <p {...stylex.props(styles.text)}>
        <Trans id="about.body" />
      </p>
    </div>
  );
}
