import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  heading: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "#444",
  },
});

export function About() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>About</h1>
      <p {...stylex.props(styles.text)}>
        This example demonstrates React components with StyleX styling and
        Starlark-defined routes, built with Bazel.
      </p>
    </div>
  );
}
