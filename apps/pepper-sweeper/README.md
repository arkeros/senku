# Pimientos de Padrón

Minesweeper, as a plate of padrón peppers — *unos pican y otros no*. Clear the
whole griddle on your own against the clock, or hand the phone back and forth
and race someone to five hot ones.

## Shape

Like [spaghetti-duel](../spaghetti-duel/README.md), this is a single
full-bleed `<canvas>` with a `requestAnimationFrame` loop; Panellet's UI layer
— StyleX, routing, JSX translation — barely applies. What the platform
provides is the build and deploy pipeline: hermetic bundle, digest-pinned
image, one `LB_BACKEND` line to reach the internet.

| Path | What lives there |
| --- | --- |
| `game/board.ts` | Cutting a viewport into a grid, absorbing a resize, and naming the cell under a finger. Knows nothing about peppers — 12 `node:test` cases. |
| `game/field.ts` | The minefield: where the peppers are, and every way a tile changes — reveal and its flood, flags, chording, and the duel's pick. Injected randomness, 28 cases. |
| `game/match.ts` | Whose go it is, what each side has found, and what ends a game. Also the two modes' board shapes — 17 cases. |
| `game/input.ts` | What a press means. Separate because a long press is the one gesture with no event of its own — 8 cases. |
| `render/` | Every `ctx` call, driven by a `World` snapshot plus a `Labels` bag. Knows nothing about React, i18n or the rules. |
| `ui/components/Plancha/` | The only stateful component. Owns the canvas, the RAF loop and the fingers. |
| `pages/Play/` | Resolves all i18n and hands the strings down. |

The split matters because a canvas game is otherwise untestable: the
interesting half — does the flood stop in the right place, does a chord bite
you, can a duel end without a winner — is pure functions, while the part that
genuinely needs a browser stays thin.

## The two games

**Solo** is minesweeper, unchanged. Tap to turn a tile, hold to mark one, tap
a number whose marks add up to clear the rest of its ring. Clear every cold
cell and the griddle is clean; the peppers stay buried, because finding them
was never the job.

**Duel** is the flags variant. There is no marking and nothing to lose: tap a
tile, and a pepper goes straight onto your plate and earns you another go,
while anything else opens like a normal reveal and hands the go across. Five
peppers takes the match. The cost of a miss is the numbers it hands the other
player, which is the whole game.

### Six things that look like mistakes and aren't

**The board does not rotate for the second player.** Its sibling on this
hostname puts the phone flat between two people facing each other and draws
every label twice. A minefield cannot: it is read through digits, and a digit
has a top. Two players at opposite ends of a table would mean one of them
doing arithmetic upside down all game, so this one is played side by side,
with the score strip lighting up whoever's go it is.

**A duel board is square, and leaves a margin at each end of a tall screen.**
Two constants hold it there. Eleven peppers is just over the floor of
`PEPPERS_TO_WIN * 2 - 1`, below which the race can end level with nothing left
to find; and five of eleven is nearly half of them, which is what makes the
match a race across the whole griddle rather than a sprint that stops while
most of it is still face down. A board filling a phone would need three times
as many peppers to keep the density worth deducing about, and five of thirty
is not a race for anything. Both bounds are asserted in `match_test.mjs`, on
the constants themselves. The margin is what that costs; it reads as a board
game on a table, which is what a duel is.

**The first solo tap re-lays the peppers.** `relayAround` holds the tapped
cell and its eight neighbours cold and deals again, so the opening move is
always a region rather than a coin toss a player can lose before they have
had a thought. A duel does not do this: there, turning up a pepper on move one
is a good start, not a death.

**A wrong mark opens a pepper.** Chording takes the player at their word about
where the peppers are, which is exactly what makes it fast — and the price of
that is that a mark in the wrong place is a bite. Making it safe would mean
the rules checking an answer the player is supposed to be working out.

**The long press draws its own progress.** A ring fills under the finger
before the mark lands. It is the one gesture with nothing on screen to suggest
it, and a player who rests a thumb by accident sees where it was going — which
teaches it without a tutorial. The ring is only drawn in solo, because a duel
has nothing to mark and a control that does nothing is worse than no control.

**A resize rescales the grid instead of recutting it.** A phone shifts under a
running game more often than it looks — the URL bar collapses on the first
tap. Re-running `layout` would hand back a different number of rows, and every
cell of a half-swept board would suddenly mean somewhere else, so `refit`
keeps the dimensions and moves only the pixels.

### Fonts

Archivo Black and IBM Plex Mono are named first in each stack but never
fetched. Canvas has no reflow: text drawn before a webfont loads simply
renders in the fallback and stays wrong until something repaints it. The
intended design lands wherever those families happen to be installed.

### The record

`pepper-sweeper.best` in `localStorage` is the fastest solo sweep, and it is a
per-device number rather than a comparable one: the board is cut from the
viewport, so a tablet is playing a wider game than a phone. On one device it
is stable, which is all a record on a puzzle you play alone needs to be.

## Running it

```bash
bazel run //apps/pepper-sweeper:app_devserver     # http://localhost:3000
bazel test //apps/pepper-sweeper/...
```

`?lang=es|en|ca` switches locale; Spanish is the source. At a desk the mouse
plays it: left button turns a tile, right button marks one, and `1` or `2`
starts a game from the title card.

## Deploying

```bash
aspect plan  //apps/pepper-sweeper:terraform
aspect apply //apps/pepper-sweeper:terraform
aspect apply //infra/cloud/gcp/lb:terraform
```

Served at **`padron.arquero.dev`**. Same constraints as the other panellet
apps: org policy (`constraints/run.allowedIngress`) permits only `internal`
and `internal-and-cloud-load-balancing`, so there is no usable `*.run.app`
URL and the shared LB is the only way in.

`defs.bzl` declares a `host` with no `paths`, meaning this backend owns every
path on that hostname — the shape an SPA needs. The root is registered in
`.aspect/stdlib.axl` ahead of the LB, because the LB's serverless NEG names
this Cloud Run service by string and a NEG whose service does not exist yet
resolves to a bare 404 rather than an error.

**DNS is not managed here.** Before the LB apply is useful, add an `A` record
for `padron.arquero.dev` pointing at the LB's `lb_ip` (`34.54.227.199`),
**DNS-only, not proxied** — Certificate Manager issuance is LB-authorized, and
behind a proxying CDN the validation never arrives and the certificate sits
`PROVISIONING` forever.
