import * as stylex from "@stylexjs/stylex";
import { useParams } from "react-router";
import { color, font, size } from "../../tokens.stylex";

const styles = stylex.create({
  heading: { fontSize: font.size4, fontWeight: font.weight7, marginBottom: size.s },
  text: { fontSize: font.size2, lineHeight: font.lineHeight3, color: color.textMuted },
});

export function City() {
  const { city } = useParams();
  const cityName = city ?? "this city";
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>Concerts in {cityName}</h1>
      <p {...stylex.props(styles.text)}>
        Showing upcoming concerts in {cityName}.
      </p>
    </div>
  );
}
