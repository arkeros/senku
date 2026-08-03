# Duelo de Espagueti

Snake, as a plate of spaghetti. Flick to steer, eat meatballs, don't tie
yourself in a knot. Play it alone for a high score, or put the phone flat on
the table with someone sitting at the other end and take best of five.

## Shape

Like [dino-meteor](../dino-meteor/README.md), this is a single full-bleed
`<canvas>` with a `requestAnimationFrame` loop; Panellet's UI layer — StyleX,
routing, JSX translation — barely applies. What the platform provides is the
build and deploy pipeline: hermetic bundle, digest-pinned image, one
`LB_BACKEND` line to reach the internet.

| Path | What lives there |
| --- | --- |
| `game/rules.ts` | The whole rulebook: grid geometry, turning, one simultaneous move for every strand, collisions, meatball spawning, and the match state machine. No canvas, no clock, injected randomness — 50 `node:test` cases. |
| `game/swipe.ts` | Fingers into headings. Separate from the rules because it is about where a hand is, not about the plate — 8 more cases. |
| `render/` | Every `ctx` call, driven by a `World` snapshot plus a `Labels` bag. Knows nothing about React, i18n or the rules. |
| `ui/components/Plate/` | The only stateful component. Owns the canvas, the RAF loop and the touches. |
| `pages/Play/` | Resolves all i18n and hands the strings down. |

The split matters because a game loop is otherwise untestable: the interesting
half — does it grow, does it crash, who took the round — is pure functions,
while the part that genuinely needs a browser stays thin.

### Five things that look like mistakes and aren't

**Turns are queued, not applied.** Two flicks between one move and the next
would otherwise fold the head straight back into the neck — up, then left,
then down, all resolved on a single move, and the snake kills itself on a
gesture the player will swear was legal. `turn` judges each flick against the
last one queued and `step` spends one per move.

**The far player's flicks are inverted.** They are reading the same glass from
the opposite end of the table, so their hand pushing away from their body
travels *down* the screen. `swipeDir` rotates their gesture half a turn, and
both players get a plain "flick the way you want to go".

**A resize rescales the grid instead of recutting it.** A phone shifts under a
running game more often than it looks — the URL bar collapses on first touch.
Re-running `layout` would hand back a different number of rows and every cell
a strand is lying on would suddenly mean somewhere else, so `refit` keeps the
dimensions and moves only the pixels. The round survives, slightly smaller.

**The strands are drawn between cells.** The rules move a whole square at a
time; `World.slide` is how far through the gap to the next move we are, and
the renderer pushes the head forward and pulls the tail in by that fraction.
Without it a plate at full speed is a slideshow.

**The viewport blocks zoom.** `maximum-scale=1, user-scalable=no` in
`index.html.tpl` is a deliberate exception to the usual accessibility rule: a
pinch mid-round zooms the plate instead of turning, and there is no DOM text
to enlarge — every string is drawn into the canvas at a size derived from the
viewport.

### Fonts

Archivo Black and IBM Plex Mono are named first in each stack but never
fetched. Canvas has no reflow: text drawn before a webfont loads simply
renders in the fallback and stays wrong until something repaints it. The
intended design lands wherever those families happen to be installed.

## Running it

```bash
bazel run //apps/spaghetti-duel:app_devserver     # http://localhost:3000
bazel test //apps/spaghetti-duel/...
```

`?lang=es|en|ca` switches locale; Spanish is the source. At a desk the arrow
keys or `WASD` drive PESTO and `IJKL` drives CARBONARA, which is enough to
check a duel without two people — the game itself wants two thumbs.

## Deploying

```bash
aspect plan  //apps/spaghetti-duel:terraform
aspect apply //apps/spaghetti-duel:terraform
aspect apply //infra/cloud/gcp/lb:terraform
```

Served at **`pasta.arquero.dev`**. Same constraints as the other panellet
apps: org policy (`constraints/run.allowedIngress`) permits only `internal`
and `internal-and-cloud-load-balancing`, so there is no usable `*.run.app`
URL and the shared LB is the only way in.

`defs.bzl` declares a `host` with no `paths`, meaning this backend owns every
path on that hostname — the shape an SPA needs.

**DNS is not managed here.** Before the LB apply is useful, add an `A` record
for `pasta.arquero.dev` pointing at the LB's `lb_ip` (`34.54.227.199`),
**DNS-only, not proxied** — Certificate Manager issuance is LB-authorized, and
behind a proxying CDN the validation never arrives and the certificate sits
`PROVISIONING` forever.
