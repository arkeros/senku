import * as stylex from "@stylexjs/stylex";
import { useRouteError } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  wrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    textAlign: "center",
    color: color.paper,
    fontFamily: font.mono,
  },
  heading: {
    margin: 0,
    fontSize: "clamp(1.1rem, 5vmin, 1.6rem)",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: color.chilli,
  },
  detail: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    color: color.muted,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

export function AppError() {
  const error = useRouteError();
  return (
    <div {...stylex.props(styles.wrap)}>
      <h1 {...stylex.props(styles.heading)}>
        <Trans id="appError.heading" />
      </h1>
      <pre {...stylex.props(styles.detail)}>
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  );
}
