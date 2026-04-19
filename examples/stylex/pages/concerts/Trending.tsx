import * as stylex from "@stylexjs/stylex";
import { Trans } from "@panellet/i18n-runtime";
import { color, font, size } from "../../tokens.stylex";

const styles = stylex.create({
  heading: { fontSize: font.size4, fontWeight: font.weight7, marginBottom: size.s },
  text: { fontSize: font.size2, lineHeight: font.lineHeight3, color: color.textMuted },
  list: { display: "flex", flexDirection: "column", gap: size.s, marginTop: size.m },
});

// Representative integers that land in every CLDR plural category we care
// about — 0/1/2/5/11/21 exercise en's one/other, es's one/other, fr's
// one(covers 0+1)/other, and ru's one/few/many in a single pass. Adjust
// when a new locale adds new categories.
const SAMPLE_COUNTS = [0, 1, 2, 5, 11, 21] as const;

export function Trending() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="concerts.trending.heading" />
      </h1>
      <p {...stylex.props(styles.text)}>
        <Trans id="concerts.trending.body" />
      </p>
      <ul {...stylex.props(styles.list)}>
        {SAMPLE_COUNTS.map((count) => (
          <li key={count}>
            <Trans id="concerts.trending.count" values={{ count }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
