# Napkin battle

A two-player pen-and-paper game for one phone: write numbers on a napkin,
beat your neighbour's number, don't spill the coffee.

Both players share the screen. On your turn you pick one of your numbered
tiles — each usable once — and write it on a free square. Every pair of
orthogonally adjacent squares owned by different players scores 1 point for
the higher number; equal numbers cancel. When the tiles run out, the bill
decides it.

The coffee stain matters. Without it the napkin is symmetric and the second
player draws every time by mirroring the first player's moves, so the stain
lands somewhere that breaks the mirror — see `stainCandidates` in
[`game/rules.ts`](./game/rules.ts) for which squares qualify and why.

## Layout

| Path | What lives there |
| --- | --- |
| `game/` | Pure rules: neighbours, scoring, stain placement, the move reducer. No React, no DOM, unit-tested with `node:test`. |
| `ui/theme/` | StyleX design tokens — the bar-table palette plus Open Props spacing. |
| `ui/components/` | Presentational only: `Napkin` (paper + pencil grid), `Cell`, `Tile`, `Bill`. They take text as props and never touch i18n. |
| `pages/` | Route components. `Play` owns all game state and every i18n call site. |
| `components/` | `Layout` (the table, nav, language switcher) and `AppError`. |

The split is deliberate: `Play` is the only component that knows about
`useI18n`, which keeps the reusable pieces free of catalog keys and makes the
build-time coverage check easy to reason about.

## Running it

```bash
bazel run //apps/napkin-battle:app_devserver     # http://localhost:3000
ibazel run //apps/napkin-battle:app_devserver    # same, rebuilding on save
bazel test //apps/napkin-battle/...
```

`?lang=es|en|ca` switches locale (Spanish is the source locale). The switcher
in the header uses plain anchors because the locale is resolved once at
bootstrap, so changing it needs a document load.

## Deploying

```bash
aspect plan  //apps/napkin-battle:terraform
aspect apply //apps/napkin-battle:terraform   # the bucket
bazel  run   //apps/napkin-battle:bucket_push # its contents
aspect apply //infra/cloud/gcp/lb:terraform
```

`aspect apply` walks these in order on its own; the split matters only when
running a step by hand. The bucket has to exist before the push, and the push
before the LB — routing to an empty bucket is a 404 with nothing to explain
it (ADR 0009).

`bucket_push` stamps each object's `Cache-Control` and `Content-Type` from
the policy in `//devtools/build/react_component:cache.bzl`, then deletes
whatever the build no longer produces. A bucket decides nothing per request,
so those two headers are the whole of what the origin says.

The image still builds (`bazel build //apps/napkin-battle:image`) and still
pushes to GAR, but nothing runs it: it is what keeps the deployed bytes
traceable to a signed, SBOM'd artifact.

### Reaching it

The shared load balancer is the only way in — the bucket answers nothing but
a cache miss from it.

It is served at **`napkin.arquero.dev`**, on its own hostname rather than a
path under `distroless.io`. That is forced, not stylistic: the game is an SPA
that serves absolute URLs (`/app_bundle/…`, `/app_styles.css`) and renders its
own 404 for unknown paths, so it needs a whole host. Hanging it off a path
prefix would first mean teaching `react_app` a base path.

`defs.bzl` exports `LB_BACKEND` with that `host` and no `paths`, which
`//infra/cloud/gcp/lb` reads to build the NEG, backend service, managed
certificate and host rule. Adding the host there is all the LB needs.

**The DNS record is not managed by Terraform.** `arquero.dev` is on
Cloudflare, and this repo provisions no DNS at all. Before the LB apply can
finish usefully, point `napkin.arquero.dev` at the LB's anycast IP (the
`lb_ip` output of the LB root):

- An `A` record, **DNS-only — not proxied**. Certificate Manager issuance is
  LB-authorized, so validation has to reach this LB directly. Behind
  Cloudflare's orange cloud, TLS terminates there instead and the certificate
  stays PROVISIONING forever.
- The certificate resource can be applied before the record exists; it will
  simply sit PROVISIONING and go ACTIVE within a few minutes of DNS
  resolving.
