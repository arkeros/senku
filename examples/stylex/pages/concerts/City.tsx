import * as stylex from "@stylexjs/stylex";
import { useParams } from "react-router";
import { Trans } from "../../../../devtools/build/react_component/i18n_runtime";
import { color, font, size } from "../../tokens.stylex";

const styles = stylex.create({
  heading: { fontSize: font.size4, fontWeight: font.weight7, marginBottom: size.s },
  text: { fontSize: font.size2, lineHeight: font.lineHeight3, color: color.textMuted },
});

export function City() {
  const { city } = useParams();
  if (!city) return null;
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="concerts.city.heading" values={{ city }} />
      </h1>
      <p {...stylex.props(styles.text)}>
        <Trans id="concerts.city.body" values={{ city }} />
      </p>
    </div>
  );
}
