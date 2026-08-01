# Dino Meteoro

Air hockey with dinosaurs. Two players, one phone flat on the table, a hand
on each end. Drag your dino, knock the meteor into the other one's goal, five
eggs to win.

## Shape

Unlike [napkin-battle](../napkin-battle/README.md), this is a single
full-bleed `<canvas>` with a `requestAnimationFrame` loop. Panellet's UI
layer — StyleX, routing, JSX translation — barely applies. What the platform
provides here is the build and deploy pipeline: hermetic bundle, digest-pinned
image, one `LB_BACKEND` line to reach the internet.

| Path | What lives there |
| --- | --- |
| `game/` | Pure arena rules: field geometry, paddle clamping, wall bounces, paddle collisions, serve, and the match state machine. No canvas, no clock, injected randomness — 27 `node:test` cases. |
| `render/` | Every `ctx` call, driven by a `World` snapshot plus a `Labels` bag. Knows nothing about React, i18n or the rules. |
| `ui/components/Arena/` | The only stateful component. Owns the canvas, the RAF loop and the pointer handlers. |
| `pages/Play/` | Resolves all i18n and hands the strings down. |

The split matters because a game loop is otherwise untestable: the interesting
half — does the meteor bounce, does the right player get the egg — is pure
functions, while the part that genuinely needs a browser stays thin.

### Two things that look like mistakes and aren't

**The world lives in a closure, not React state.** `Arena` mounts one effect
and never re-renders; a 60fps `setState` would be absurd. Changing props are
read through a ref so a locale switch never restarts a match.

**The viewport blocks zoom.** `maximum-scale=1, user-scalable=no` in
`index.html.tpl` is a deliberate exception to the usual accessibility rule: a
pinch mid-rally zooms the arena instead of hitting the meteor, and there is no
DOM text to enlarge — every string is drawn into the canvas at a size derived
from the viewport.

### Fonts

The prototype pulled Archivo Black and IBM Plex Mono from Google Fonts. Both
are dropped in favour of system stacks. Canvas has no reflow: text drawn
before a webfont loads simply renders in the fallback and stays wrong until
something repaints it. The named families are still first in each stack, so
the intended design lands wherever they happen to be installed.

## Running it

```bash
bazel run //apps/dino-meteor:app_devserver     # http://localhost:3000
bazel test //apps/dino-meteor/...
```

`?lang=es|en|ca` switches locale; Spanish is the source. On a desktop the
mouse drives one dino, which is enough to check the physics — the game itself
wants two thumbs.

## Deploying

```bash
aspect plan  //apps/dino-meteor:terraform
aspect apply //apps/dino-meteor:terraform
aspect apply //infra/cloud/gcp/lb:terraform
```

Served at **`dino.arquero.dev`**. Same constraints as napkin-battle: org
policy (`constraints/run.allowedIngress`) permits only `internal` and
`internal-and-cloud-load-balancing`, so there is no usable `*.run.app` URL and
the shared LB is the only way in.

`defs.bzl` declares a `host` with no `paths`, meaning this backend owns every
path on that hostname — the shape an SPA needs.

**DNS is not managed here.** Before the LB apply is useful, add an `A` record
for `dino.arquero.dev` pointing at the LB's `lb_ip` (`34.54.227.199`),
**DNS-only, not proxied** — Certificate Manager issuance is LB-authorized, and
behind a proxying CDN the validation never arrives and the certificate sits
`PROVISIONING` forever.
