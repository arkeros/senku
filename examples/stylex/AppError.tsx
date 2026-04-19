import * as stylex from "@stylexjs/stylex";
import { useRouteError } from "react-router";
import { Trans } from "@panallet/i18n-runtime";
import { color, size } from "./tokens.stylex";

const styles = stylex.create({
  wrap: {
    padding: size.m,
    borderTop: `4px solid ${color.primary}`,
  },
  message: {
    color: color.primary,
  },
});

export function AppError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div {...stylex.props(styles.wrap)}>
      <h1><Trans id="appError.title" /></h1>
      <pre {...stylex.props(styles.message)}>{message}</pre>
    </div>
  );
}
