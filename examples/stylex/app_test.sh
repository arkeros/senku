#!/usr/bin/env bash
set -euo pipefail

# Test generated router has correct lazy imports and structure
ROUTER="examples/stylex/app_router.js"
echo "=== Router tests ==="

grep -q 'import("./Layout")' "$ROUTER" || { echo "FAIL: missing Layout lazy import"; exit 1; }
grep -q 'import("./pages/Home")' "$ROUTER" || { echo "FAIL: missing Home lazy import"; exit 1; }
grep -q 'import("./pages/About")' "$ROUTER" || { echo "FAIL: missing About lazy import"; exit 1; }
grep -q 'import("./pages/concerts/ConcertsHome")' "$ROUTER" || { echo "FAIL: missing ConcertsHome lazy import"; exit 1; }
grep -q 'import("./pages/concerts/City")' "$ROUTER" || { echo "FAIL: missing City lazy import"; exit 1; }
grep -q 'createBrowserRouter' "$ROUTER" || { echo "FAIL: missing createBrowserRouter"; exit 1; }
grep -q 'path: "concerts"' "$ROUTER" || { echo "FAIL: missing concerts route"; exit 1; }
grep -q 'path: ":city"' "$ROUTER" || { echo "FAIL: missing :city param route"; exit 1; }
grep -q 'Component: m.Layout' "$ROUTER" || { echo "FAIL: missing Layout component reference"; exit 1; }
# errorElement + 404 support (#94). JSX compiles <Name /> to _jsx(Name, {}),
# so assert on the compiled form here — the source shape is covered by the
# router_ts typecheck test.
grep -q 'import { AppError }' "$ROUTER" || { echo "FAIL: missing AppError static import"; exit 1; }
grep -q 'import { RouteError }' "$ROUTER" || { echo "FAIL: missing RouteError static import"; exit 1; }
grep -q 'errorElement: .*_jsx(AppError' "$ROUTER" || { echo "FAIL: missing app-level errorElement"; exit 1; }
grep -q 'errorElement: .*_jsx(RouteError' "$ROUTER" || { echo "FAIL: missing route-level errorElement"; exit 1; }
grep -q 'path: "\*"' "$ROUTER" || { echo "FAIL: missing 404 catch-all path"; exit 1; }
grep -q 'import("./pages/NotFound")' "$ROUTER" || { echo "FAIL: missing NotFound lazy import"; exit 1; }
echo "PASS: router"

# Test generated main entry point
MAIN="examples/stylex/app_main.js"
echo "=== Main tests ==="

grep -q 'import.*RouterProvider.*from.*"react-router"' "$MAIN" || { echo "FAIL: missing RouterProvider import"; exit 1; }
grep -q 'import.*router.*from.*"./app_router"' "$MAIN" || { echo "FAIL: missing router import"; exit 1; }
grep -q 'createRoot' "$MAIN" || { echo "FAIL: missing createRoot"; exit 1; }
echo "PASS: main"

# Test CSS contains styles from all components including transitive deps
CSS="examples/stylex/app_styles.css"
echo "=== CSS tests ==="

grep -q 'cursor:pointer' "$CSS" || { echo "FAIL: missing Button cursor style"; exit 1; }
grep -q 'border-radius' "$CSS" || { echo "FAIL: missing Button border-radius"; exit 1; }
grep -q 'min-height:100vh' "$CSS" || { echo "FAIL: missing Layout min-height"; exit 1; }
grep -q 'font-family:var(' "$CSS" || { echo "FAIL: missing Layout font-family rule"; exit 1; }
grep -q -- '--font-sans' "$CSS" || { echo "FAIL: missing --font-sans from Open Props (token chain broken)"; exit 1; }
grep -q 'text-decoration:none' "$CSS" || { echo "FAIL: missing link text-decoration"; exit 1; }
echo "PASS: css"

# Test production HTML
HTML="examples/stylex/app_index.html"
echo "=== HTML tests ==="

grep -q 'app_bundle/app_main.js' "$HTML" || { echo "FAIL: missing bundle script tag"; exit 1; }
grep -q 'app_styles.css' "$HTML" || { echo "FAIL: missing stylesheet link"; exit 1; }
# runtime_config: /env.js must precede the bundle so window.__ENV__ is set before module eval.
grep -qE '<script src="/env\.js"></script><script type="module" src="/app_bundle/app_main\.js">' "$HTML" \
  || { echo "FAIL: /env.js script tag missing or not ordered before app_main module"; exit 1; }
echo "PASS: html"

# Runtime config bootstraps: dev has literal default, prod has ${VAR} placeholder.
ENV_DEV="examples/stylex/app_env_dev.js"
ENV_TPL="examples/stylex/app_env.js.tpl"
echo "=== Runtime config tests ==="

grep -q 'window\.__ENV__ = {' "$ENV_DEV" || { echo "FAIL: dev env.js missing window.__ENV__ init"; exit 1; }
grep -q '"API_URL": "http://localhost:8080"' "$ENV_DEV" || { echo "FAIL: dev env.js missing API_URL literal"; exit 1; }
grep -q 'window\.__ENV__ = {' "$ENV_TPL" || { echo "FAIL: env.js.tpl missing window.__ENV__ init"; exit 1; }
# Prod placeholder is base64-wrapped — the base64 alphabet is inert inside a JS string literal,
# so operator-supplied values cannot break out of the quotes or inject script.
grep -qF '"API_URL": atob("${API_URL_B64}")' "$ENV_TPL" \
  || { echo "FAIL: env.js.tpl missing atob(\${API_URL_B64}) placeholder"; exit 1; }
echo "PASS: runtime config"

# Asset pipeline: devserver manifest + hashed file in the flat dir.
# Locks in the #95 acceptance — the asset flows end-to-end.
ASSETS_MANIFEST="examples/stylex/app_assets.json"
ASSETS_DIR="examples/stylex/app_assets_flat"
echo "=== Asset pipeline tests ==="

grep -q '"type": "assets"' "$ASSETS_MANIFEST" || { echo "FAIL: manifest missing type field"; exit 1; }
grep -qE '"/assets/panellet_logo\.[0-9a-f]{12}\.png"' "$ASSETS_MANIFEST" || { echo "FAIL: manifest missing hashed logo URL"; exit 1; }
HASHED=$(grep -oE 'panellet_logo\.[0-9a-f]{12}\.png' "$ASSETS_MANIFEST" | head -1)
[ -f "$ASSETS_DIR/$HASHED" ] || { echo "FAIL: hashed logo file $HASHED not in $ASSETS_DIR"; exit 1; }
echo "PASS: asset pipeline (hashed as $HASHED)"

# i18n pipeline: bundle must carry every locale's translations inline, and
# main.tsx must wrap the router in <I18nProvider>.
#
# esbuild rewrites non-ASCII as \uXXXX escapes (uppercase hex digits). We
# grep with -i so Cyrillic can match either case, and we use the literal
# escape form rather than raw Cyrillic so the assertions are source-greppable
# on any terminal.
# With `splitting = True`, the bundle is a directory of ESM chunks instead
# of a single file. Grep across all .js chunks so we don't depend on which
# chunk esbuild extracts each string into.
BUNDLE_DIR="examples/stylex/app_bundle"
BUNDLE_FILES=$(find "$BUNDLE_DIR" -name '*.js' -not -name '*.map')
echo "=== i18n tests ==="

grep -lqF "I18nProvider" $BUNDLE_FILES || { echo "FAIL: bundle missing I18nProvider wrapper"; exit 1; }
# No explicit pickLocale check: it's an internal helper mangled away by
# the prod minify pass. The catalog + data assertions below cover the
# behavior we actually care about.

# Nav labels — each locale's "Home" must be present.
grep -lqF "Inicio" $BUNDLE_FILES || { echo "FAIL: bundle missing 'Inicio' (es:layout.nav.home)"; exit 1; }
grep -lqF "Accueil" $BUNDLE_FILES || { echo "FAIL: bundle missing 'Accueil' (fr:layout.nav.home)"; exit 1; }
# Russian Главная → \u0413\u043b\u0430\u0432\u043d\u0430\u044f
grep -liqF '\u0413\u043b\u0430\u0432\u043d\u0430\u044f' $BUNDLE_FILES || { echo "FAIL: bundle missing Russian 'Главная'"; exit 1; }

# Concerts translations — each locale's version of "Concerts".
grep -lqF "Conciertos" $BUNDLE_FILES || { echo "FAIL: bundle missing es:Conciertos"; exit 1; }
# Russian Концерты → \u041a\u043e\u043d\u0446\u0435\u0440\u0442\u044b
grep -liqF '\u041a\u043e\u043d\u0446\u0435\u0440\u0442\u044b' $BUNDLE_FILES || { echo "FAIL: bundle missing Russian 'Концерты'"; exit 1; }

# Interpolation — {$city} placeholder survives through MF2 in every locale.
grep -lqF "Conciertos en" $BUNDLE_FILES || { echo "FAIL: bundle missing es:concerts.city.heading prefix"; exit 1; }
# French à → \xE0 after esbuild escape pass.
grep -lqF 'Concerts \xE0' $BUNDLE_FILES || { echo "FAIL: bundle missing fr:concerts.city.heading prefix"; exit 1; }

# Plural forms — Russian's one/few/many for "концерт" all have distinct
# stems so each form is independently greppable.
# концерт  → \u043a\u043e\u043d\u0446\u0435\u0440\u0442
# концерта → ...\u0442\u0430
# концертов → ...\u0442\u043e\u0432
grep -liqF '\u043a\u043e\u043d\u0446\u0435\u0440\u0442' $BUNDLE_FILES || { echo "FAIL: bundle missing ru:one form 'концерт'"; exit 1; }
grep -liqF '\u043a\u043e\u043d\u0446\u0435\u0440\u0442\u0430' $BUNDLE_FILES || { echo "FAIL: bundle missing ru:few form 'концерта'"; exit 1; }
grep -liqF '\u043a\u043e\u043d\u0446\u0435\u0440\u0442\u043e\u0432' $BUNDLE_FILES || { echo "FAIL: bundle missing ru:many form 'концертов'"; exit 1; }

# Source-locale strings should NOT appear in the generated I18N_CATALOGS
# entries for other locales (i.e. no "Home" value in an es catalog entry).
# Broad check: confirm the catalog object exists and carries locale keys.
grep -lEq '"layout\.nav\.home":\s*"Inicio"' $BUNDLE_FILES || { echo "FAIL: bundle missing es:layout.nav.home entry"; exit 1; }

echo "PASS: i18n"

echo "All tests passed."
