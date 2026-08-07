#!/usr/bin/env bash
set -euo pipefail

# The prerender's whole purpose is that a document arrives with something
# paintable in it. A build that silently produced an empty `#root` would
# still be a green build everywhere else — every other test here checks the
# document's tags, not its contents — so this is the one place the property
# is actually asserted. See docs/adr/0013-build-time-prerender.md.

INDEX="apps/napkin-battle/app_index.html"
ROUTE="apps/napkin-battle/how-to-play/index.html"

# Text, not markup: FCP counts painted glyphs, and a wrapper `<div>` with no
# text in it is exactly the failure this test exists to catch.
#
# Every string asserted here has to be one the template does not already
# contain. "Batalla de servilleta" would read as the obvious choice and is
# useless — it is the document's `<title>`, so it matches whether or not a
# single byte was prerendered.
grep -q "Bolígrafo azul" "$INDEX" \
  || { echo "FAIL: index document carries no prerendered board"; exit 1; }
grep -q "Turno del azul" "$INDEX" \
  || { echo "FAIL: index document carries no prerendered game state"; exit 1; }

# The placeholder resolving to the literal string would ship "{{APP}}" as
# visible page text.
if grep -q '{{APP}}' "$INDEX"; then
  echo "FAIL: {{APP}} left unsubstituted in the index document"; exit 1
fi

# A route document is rendered at its own path, not handed the index's
# markup. Copying the index here would still paint something, so asserting
# "non-empty" would pass while the routes were all wrong.
grep -q "Cada jugador tiene sus fichas numeradas" "$ROUTE" \
  || { echo "FAIL: how-to-play document does not carry its own route's markup"; exit 1; }
if grep -q "Bolígrafo azul" "$ROUTE"; then
  echo "FAIL: how-to-play document carries the index route's markup"; exit 1
fi

echo "PASS: prerendered markup"
