import * as stylex from "@stylexjs/stylex";
import { NavLink, Outlet } from "react-router";
import { Trans } from "@panellet/i18n-runtime";
import { color, font, size } from "../../ui/theme/tokens.stylex";

/**
 * Language is resolved once at bootstrap from `?lang=` (see `pickLocale` in
 * @panellet/i18n-runtime), so switching is a plain anchor and a full reload —
 * a client-side navigation would leave the old catalog in place. Relative
 * hrefs keep whatever route you were on.
 */
const LOCALES = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "ca", label: "CA" },
] as const;

const styles = stylex.create({
  table: {
    minHeight: "100dvh",
    backgroundImage:
      "radial-gradient(120% 90% at 50% 0%, #1D3F38 0%, #16322D 45%, #0D211E 100%)",
    color: color.chalk,
    fontFamily: font.typed,
    display: "flex",
    justifyContent: "center",
    paddingTop: 18,
    paddingInline: 14,
    paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
  },
  column: {
    width: "100%",
    maxWidth: 430,
  },
  header: {
    textAlign: "center",
    marginBottom: size.s,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: font.weight7,
    letterSpacing: "0.34em",
    textIndent: "0.34em",
    textTransform: "uppercase",
    color: color.paper,
  },
  tagline: {
    marginTop: 6,
    marginBottom: 0,
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: color.graphite,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: size.s,
    marginTop: size.s,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  link: {
    color: color.graphite,
    textDecoration: "none",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.transparent,
  },
  linkOn: {
    color: color.paper,
    borderBottomColor: color.paper,
  },
  langs: {
    display: "flex",
    gap: size.xs,
    marginInlineStart: "auto",
  },
});

const navClass = ({ isActive }: { isActive: boolean }) =>
  stylex.props(styles.link, isActive && styles.linkOn).className;

export function Layout() {
  return (
    <div {...stylex.props(styles.table)}>
      <div {...stylex.props(styles.column)}>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>
            <Trans id="layout.title" />
          </h1>
          <p {...stylex.props(styles.tagline)}>
            <Trans id="layout.tagline" />
          </p>
        </header>

        <nav {...stylex.props(styles.bar)}>
          {/* NavLink drives its own className, so it gets the style function
              rather than a `stylex.props` spread. */}
          <NavLink to="/" end className={navClass}>
            <Trans id="layout.nav.play" />
          </NavLink>
          <NavLink to="/how-to-play" className={navClass}>
            <Trans id="layout.nav.howToPlay" />
          </NavLink>
          <span {...stylex.props(styles.langs)}>
            {LOCALES.map(({ code, label }) => (
              <a key={code} href={`?lang=${code}`} {...stylex.props(styles.link)}>
                {label}
              </a>
            ))}
          </span>
        </nav>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
