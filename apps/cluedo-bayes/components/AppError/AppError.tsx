import * as stylex from "@stylexjs/stylex";
import { useRouteError } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  wrap: {
    maxWidth: 560,
    marginInline: "auto",
    padding: 24,
    color: color.ink,
    fontFamily: font.serif,
  },
  heading: {
    marginTop: 0,
    fontSize: 18,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: color.red,
  },
  detail: {
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 1.5,
    color: color.dim,
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
