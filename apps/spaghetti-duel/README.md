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
| `game/bot.ts` | The five sauces you can play against, and the one scoring function underneath them. A third controller beside `swipe` and `keys`: it hands back a heading and the caller spends it through `turn`, so the rulebook never learns one of its strands is artificial. |
| `render/` | Every `ctx` call, driven by a `World` snapshot plus a `Labels` bag. Knows nothing about React, i18n or the rules. |
| `ui/components/Plate/` | The only stateful component. Owns the canvas, the RAF loop and the touches. |
| `pages/Play/` | Resolves all i18n and hands the strings down. |

The split matters because a game loop is otherwise untestable: the interesting
half — does it grow, does it crash, who took the round — is pure functions,
while the part that genuinely needs a browser stays thin.

### Six things that look like mistakes and aren't

**Turns are queued, not applied.** Two flicks between one move and the next
would otherwise fold the head straight back into the neck — up, then left,
then down, all resolved on a single move, and the snake kills itself on a
gesture the player will swear was legal. `turn` judges each flick against the
last one queued and `step` spends one per move.

**A queued turn lands one cell further on than you might expect.** `step`
completes the move `dir` already pointed at and only then takes the flick up
as the next heading, so a turn flicked mid-glide is taken leaving the cell
ahead rather than the cell behind. That is the move the renderer has spent
the whole interval easing the head into: answering the flick from `body[0]`
instead would drag the head back through a corner it visibly never turned.

**The far player's flicks are *not* inverted.** They read the same glass from
the opposite end of the table, which looks like a case for rotating their
gesture half a turn — it isn't. Their finger and their strand are on the same
pane, and `advance` spends a `Dir` in screen space for either seat, so a
rotation would send the strand away from the finger dragging it. `swipeDir`
is deliberately blind to the seat; `seatAt` decides only *whose* strand a
touch steers.

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
check a duel without two people — the game itself wants two thumbs. `1` and
`2` start solo and a duel, `B` opens the roster, `1`–`5` pick a sauce off it
and `Escape` backs out. Every card can be left by key alone, which is the
thing `keys.ts` exists to keep true.

### The bot

Playing a sauce is a **duel** with a bot controlling the far seat — not a
third mode. `Mode` still counts strands; who steers them is a separate axis,
which is why nothing in `rules.ts` changed to add any of this. See
[ADR 0001](./docs/adr/0001-a-bot-is-a-controller-not-a-mode.md).

A bot is four numbers: how far it can see, how hard it chases a meatball, how
hard it crowds you, and what it thinks of a move that kills you both. Space is
a **gate** rather than a term in that sum, so no amount of appetite talks one
into a pocket — which leaves sight as the only reason a bot ever dies, and
means every death can be explained by pointing at the board.
[ADR 0002](./docs/adr/0002-the-bot-is-beatable-because-it-cannot-see-far.md)
has the measurements, including why a bot that sees 96 cells is one you cannot
beat and one that sees 64 is.

The words all of this is written in — **Controller**, **Reader**, **Persona**,
**Horizon** — are fixed in [CONTEXT.md](./CONTEXT.md).

## Deploying

```bash
aspect plan  //apps/spaghetti-duel:terraform
aspect apply //apps/spaghetti-duel:terraform   # the bucket
bazel  run   //apps/spaghetti-duel:bucket_push # its contents
aspect apply //infra/cloud/gcp/lb:terraform
```

`aspect apply` walks all three in that order on its own; the split matters
only when running a step by hand. See ADR 0009 for why the order is
load-bearing.

Served at **`pasta.arquero.dev`**. The shared LB is what serves the site;
the bucket only ever answers a cache miss.

`defs.bzl` declares a `host` with no `paths`, meaning this backend owns every
path on that hostname — the shape an SPA needs.

**DNS is not managed here.** Before the LB apply is useful, add an `A` record
for `pasta.arquero.dev` pointing at the LB's `lb_ip` (`34.54.227.199`),
**DNS-only, not proxied** — Certificate Manager issuance is LB-authorized, and
behind a proxying CDN the validation never arrives and the certificate sits
`PROVISIONING` forever.
