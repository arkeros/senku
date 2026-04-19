import * as stylex from "@stylexjs/stylex";
import { Link, useLocation } from "react-router";
import { Trans } from "../../../devtools/build/react_component/i18n_runtime";
import { color, font, size } from "../tokens.stylex";

const styles = stylex.create({
  wrap: {
    padding: size.m,
  },
  heading: {
    fontSize: 32,
    fontWeight: font.weight5,
    marginBottom: size.s,
  },
  link: {
    color: color.primary,
  },
});

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div {...stylex.props(styles.wrap)}>
      <h1 {...stylex.props(styles.heading)}><Trans id="notFound.heading" /></h1>
      <p><Trans id="notFound.body" values={{ pathname }} /></p>
      <Link to="/" {...stylex.props(styles.link)}>
        <Trans id="notFound.backHome" />
      </Link>
    </div>
  );
}
