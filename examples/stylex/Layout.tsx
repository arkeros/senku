import * as stylex from "@stylexjs/stylex";
import { Link, Outlet } from "react-router";
import {
  Trans,
  useI18n,
} from "@panellet/i18n-runtime";
import { panelletLogoUrl } from "./Layout.assets";
import { color, font, size } from "./tokens.stylex";

const styles = stylex.create({
  layout: {
    fontFamily: font.sans,
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    gap: size.s,
    padding: size.s,
    alignItems: "center",
    borderBottom: `1px solid ${color.border}`,
  },
  logo: {
    height: "32px",
    width: "auto",
  },
  link: {
    color: color.primary,
    textDecoration: "none",
    fontWeight: font.weight5,
  },
  content: {
    padding: size.m,
  },
});

export function Layout() {
  const { format } = useI18n();
  return (
    <div {...stylex.props(styles.layout)}>
      <nav {...stylex.props(styles.nav)}>
        <img
          src={panelletLogoUrl}
          alt={format("layout.logo.alt")}
          {...stylex.props(styles.logo)}
        />
        <Link to="/" {...stylex.props(styles.link)}>
          <Trans id="layout.nav.home" />
        </Link>
        <Link to="/about" {...stylex.props(styles.link)}>
          <Trans id="layout.nav.about" />
        </Link>
        <Link to="/concerts" {...stylex.props(styles.link)}>
          <Trans id="layout.nav.concerts" />
        </Link>
      </nav>
      <main {...stylex.props(styles.content)}>
        <Outlet />
      </main>
    </div>
  );
}
