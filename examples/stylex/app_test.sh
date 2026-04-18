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

grep -q 'app_bundle.js' "$HTML" || { echo "FAIL: missing bundle script tag"; exit 1; }
grep -q 'app_styles.css' "$HTML" || { echo "FAIL: missing stylesheet link"; exit 1; }
# runtime_config: /env.js must precede the bundle so window.__ENV__ is set before module eval.
grep -qE '<script src="/env\.js"></script><script src="/app_bundle\.js">' "$HTML" \
  || { echo "FAIL: /env.js script tag missing or not ordered before app_bundle"; exit 1; }
echo "PASS: html"

# Runtime config bootstraps: dev has literal default, prod has ${VAR} placeholder.
ENV_DEV="examples/stylex/app_env_dev.js"
ENV_TPL="examples/stylex/app_env.js.tpl"
echo "=== Runtime config tests ==="

grep -q 'window\.__ENV__ = {' "$ENV_DEV" || { echo "FAIL: dev env.js missing window.__ENV__ init"; exit 1; }
grep -q '"API_URL": "http://localhost:8080"' "$ENV_DEV" || { echo "FAIL: dev env.js missing API_URL literal"; exit 1; }
grep -q 'window\.__ENV__ = {' "$ENV_TPL" || { echo "FAIL: env.js.tpl missing window.__ENV__ init"; exit 1; }
grep -q '"API_URL": "\${API_URL}"' "$ENV_TPL" || { echo "FAIL: env.js.tpl missing \${API_URL} placeholder"; exit 1; }
echo "PASS: runtime config"

# Asset pipeline: devserver manifest + hashed file in the flat dir.
# Locks in the #95 acceptance — the asset flows end-to-end.
ASSETS_MANIFEST="examples/stylex/app_assets.json"
ASSETS_DIR="examples/stylex/app_assets_flat"
echo "=== Asset pipeline tests ==="

grep -q '"type": "assets"' "$ASSETS_MANIFEST" || { echo "FAIL: manifest missing type field"; exit 1; }
grep -qE '"/assets/panallet_logo\.[0-9a-f]{12}\.png"' "$ASSETS_MANIFEST" || { echo "FAIL: manifest missing hashed logo URL"; exit 1; }
HASHED=$(grep -oE 'panallet_logo\.[0-9a-f]{12}\.png' "$ASSETS_MANIFEST" | head -1)
[ -f "$ASSETS_DIR/$HASHED" ] || { echo "FAIL: hashed logo file $HASHED not in $ASSETS_DIR"; exit 1; }
echo "PASS: asset pipeline (hashed as $HASHED)"

echo "All tests passed."
