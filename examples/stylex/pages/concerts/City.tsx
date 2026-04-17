import * as stylex from "@stylexjs/stylex";
import { useParams } from "react-router";

const styles = stylex.create({
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16 },
  text: { fontSize: 16, lineHeight: 1.6, color: "#444" },
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
