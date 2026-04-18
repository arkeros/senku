import * as stylex from "@stylexjs/stylex";
import { Button } from "../Button";
import { getEnv } from "../app_env";

const styles = stylex.create({
  container: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  apiUrl: {
    fontFamily: "monospace",
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
  },
});

export function Home() {
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}>Home</h1>
      <p {...stylex.props(styles.apiUrl)}>API: {getEnv("API_URL")}</p>
      <div {...stylex.props(styles.container)}>
        <Button label="Primary" />
        <Button label="Secondary" variant="secondary" />
      </div>
    </div>
  );
}
