import * as stylex from "@stylexjs/stylex";
import { useRouteError } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font, radius, size } from "../../ui/theme/tokens.stylex";

const styles = stylex.create({
  card: {
    marginTop: size.s,
    backgroundColor: color.paper,
    color: color.ink,
    borderRadius: radius.sm,
    padding: size.m,
    borderTopWidth: 4,
    borderTopStyle: "solid",
    borderTopColor: color.red,
  },
  heading: {
    marginTop: 0,
    marginBottom: size.xs,
    fontSize: 14,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  detail: {
    margin: 0,
    fontFamily: font.typed,
    fontSize: 12,
    lineHeight: font.lineHeight3,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

export function AppError() {
  const error = useRouteError();
  return (
    <div {...stylex.props(styles.card)}>
      <h2 {...stylex.props(styles.heading)}>
        <Trans id="appError.heading" />
      </h2>
      <pre {...stylex.props(styles.detail)}>
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  );
}
