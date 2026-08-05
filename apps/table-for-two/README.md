# Mesa para dos

A two-player game on a single phone. Put it flat between you, sit facing each
other, and race to answer whatever the screen throws up. Five points wins, and
the loser pays.

Five kinds of round, drawn at random:

| Round | What you do |
| --- | --- |
| Reflex | Tap your half the instant it turns green. Tap early and you gift the point. |
| Arithmetic | Two-digit sum or difference, two answers. |
| Stroop | A colour name printed in a *different* colour. Tap the ink, not the word. |
| Parity | Even or odd. |
| Bigger | Two numbers, tap the larger. |

## Shape

Pure DOM, so unlike [dino-meteor](../dino-meteor/README.md) the framework
earns its keep here: StyleX for the two halves, MF2 catalogs for every string,
React state for a state machine that ticks a few times a second rather than
sixty.

| Path | What lives there |
| --- | --- |
| `game/` | Challenge generation, judging and the tally. 22 `node:test` cases. |
| `ui/components/Half/` | One player's half — tone, prompt, options, stamp. Presentational. |
| `ui/components/Ticket/` | The order slip between them: score boxes and one status line printed both ways up. |
| `pages/Play/` | The match loop, its timers, and every i18n call site. |

### The generator is language-neutral on purpose

The prototype built display strings inside the challenge generator — `"PAR"`,
`"ROJO"`, `"¿cuánto da?"` — which made it untranslatable. Here `challenge()`
yields numbers and enum members (`"even"`, `"red"`, `op: "+"`), and the route
component turns them into text. That is what lets the same generator serve
three locales, and it is why every invariant is testable: the Stroop ink never
matches its word, subtraction never goes negative, and the two options always
contain exactly one correct answer.

Randomness is injected rather than sampled, so those invariants are checked
across 200 generated challenges per kind instead of hoped for.

### Fixed while porting

The prototype's round counter and win check drifted from each other under the
async result handler. Here the point is awarded once, when the round resolves,
and the result timer reads the winner off the match rather than awarding again
— counting twice would have ended matches at three points. The end-to-end
run confirms it: a match still takes five decided rounds.

## Running it

```bash
bazel run //apps/table-for-two:app_devserver     # http://localhost:3000
bazel test //apps/table-for-two/...
```

`?lang=es|en|ca`; Spanish is the source locale.

## Deploying

Served at **`mesa.arquero.dev`**. Like the other games it is a bucket behind
the shared load balancer, which is what serves the site; the bucket only ever
answers a cache miss.

```bash
aspect apply //apps/table-for-two:terraform   # the bucket
bazel  run   //apps/table-for-two:bucket_push # its contents
aspect apply //infra/cloud/gcp/lb:terraform
```

`aspect apply` walks all three in that order on its own; the split matters
only when running a step by hand. See ADR 0009 for why the order is
load-bearing.

**DNS is not managed here.** Add an `A` record for `mesa.arquero.dev` →
`34.54.227.199` (the LB's `lb_ip`), **DNS-only, not proxied** — Certificate
Manager issuance is LB-authorized, and behind a proxying CDN the validation
never arrives.
