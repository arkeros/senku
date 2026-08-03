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
    color: color.bone,
    fontFamily: font.mono,
  },
  heading: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "clamp(22px, 7vw, 40px)",
    color: color.tomato,
  },
  detail: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    opacity: 0.75,
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
