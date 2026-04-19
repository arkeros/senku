import * as stylex from "@stylexjs/stylex";
import { useRouteError } from "react-router";
import { Trans } from "../../devtools/build/react_component/i18n_runtime";
import { size } from "./tokens.stylex";

const styles = stylex.create({
  wrap: {
    padding: size.s,
  },
});

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div {...stylex.props(styles.wrap)}>
      <p><Trans id="routeError.message" values={{ message }} /></p>
    </div>
  );
}
