import * as stylex from "@stylexjs/stylex";
import { color, font, size } from "../../tokens.stylex";

const styles = stylex.create({
  heading: { fontSize: font.size4, fontWeight: font.weight7, marginBottom: size.s },
  text: { fontSize: font.size2, lineHeight: font.lineHeight3, color: color.textMuted },
});

export function Trending() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>Trending Concerts</h1>
      <p {...stylex.props(styles.text)}>
        The hottest concerts right now.
      </p>
    </div>
  );
}
