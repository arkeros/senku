#!/usr/bin/env bash
set -euo pipefail

# Test generated router has correct imports and structure
ROUTER="examples/stylex/app_router.js"
echo "=== Router tests ==="

grep -q 'import.*Layout.*from.*"./Layout"' "$ROUTER" || { echo "FAIL: missing Layout import"; exit 1; }
grep -q 'import.*Home.*from.*"./pages/Home"' "$ROUTER" || { echo "FAIL: missing Home import"; exit 1; }
grep -q 'import.*About.*from.*"./pages/About"' "$ROUTER" || { echo "FAIL: missing About import"; exit 1; }
grep -q 'import.*ConcertsHome.*from.*"./pages/concerts/ConcertsHome"' "$ROUTER" || { echo "FAIL: missing ConcertsHome import"; exit 1; }
grep -q 'import.*City.*from.*"./pages/concerts/City"' "$ROUTER" || { echo "FAIL: missing City import"; exit 1; }
grep -q 'createBrowserRouter' "$ROUTER" || { echo "FAIL: missing createBrowserRouter"; exit 1; }
grep -q 'path: "concerts"' "$ROUTER" || { echo "FAIL: missing concerts route"; exit 1; }
grep -q 'path: ":city"' "$ROUTER" || { echo "FAIL: missing :city param route"; exit 1; }
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
grep -q 'font-family:system-ui' "$CSS" || { echo "FAIL: missing Layout font-family"; exit 1; }
grep -q 'text-decoration:none' "$CSS" || { echo "FAIL: missing link text-decoration"; exit 1; }
echo "PASS: css"

# Test production HTML
HTML="examples/stylex/app_index.html"
echo "=== HTML tests ==="

grep -q 'app_bundle.js' "$HTML" || { echo "FAIL: missing bundle script tag"; exit 1; }
grep -q 'app_styles.css' "$HTML" || { echo "FAIL: missing stylesheet link"; exit 1; }
echo "PASS: html"

echo "All tests passed."
