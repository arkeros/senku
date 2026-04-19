import * as stylex from "@stylexjs/stylex";
import {
  Trans,
  useI18n,
} from "@panallet/i18n-runtime";
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
  const { format } = useI18n();
  return (
    <div>
      <h1 {...stylex.props(styles.heading)}><Trans id="home.heading" /></h1>
      <p {...stylex.props(styles.apiUrl)}>
        <Trans id="home.apiLabel" values={{ url: getEnv("API_URL") }} />
      </p>
      <div {...stylex.props(styles.container)}>
        <Button label={format("home.button.primary")} />
        <Button label={format("home.button.secondary")} variant="secondary" />
      </div>
    </div>
  );
}
