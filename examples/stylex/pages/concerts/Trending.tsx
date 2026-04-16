import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16 },
  text: { fontSize: 16, lineHeight: 1.6, color: "#444" },
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
