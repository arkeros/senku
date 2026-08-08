# A bot is a controller, not a mode

`Mode` stays `solo | duel` and keeps meaning one thing: how many strands are on
the plate. A bot match is a `duel` in which the `top` seat's **controller** is a
bot rather than a pair of thumbs. Nothing in `game/rules.ts` knows a bot exists —
`game/bot.ts` returns a `Dir` and spends it through `turn()` exactly as a flick
does, and `step` cannot tell which of its two strands is being steered by a
person.

## Why

The README's central claim is that `rules.ts` is about the plate while `swipe.ts`
and `keys.ts` are about the hands, and that this is what makes a game loop
testable at all. A bot is a hand. Putting it anywhere else spends the one
boundary this app is built around.

The obvious alternative — a third `Mode` value — fails for a more specific
reason than "it's less tidy". `Mode` is read at six places, and they do not all
mean the same thing by `"duel"`:

| site | what it is really asking |
| --- | --- |
| `newSnakes` | how many strands to deal — **two** |
| `endRound` | is this best of five — **yes** |
| `seatsOf` (score cards) | how many strands have a score — **two** |
| `seatAt` | how many pairs of hands share the glass — **one** |
| `seatsOf` (message card) | how many people need to read this — **one** |
| `rememberBest` | is this a solo high score — **no** |

Three of those want the duel answer and three want the solo answer. A third
`Mode` value does not resolve that ambiguity, it just makes every one of the six
sites choose between three branches instead of two, with no help from the type
about which question it is answering. Splitting the axis answers all six at
once, because each site then reads the thing it actually meant: strand count
from `Mode`, human count from the controllers.

## Considered options

**A controller per seat (chosen).** `Mode` counts strands, controllers count
people. The bot lives beside the other two input modules and the rulebook is
untouched.

**`Mode = "solo" | "duel" | "bot"` (rejected).** Cheaper on the day — one new
value, six `switch`es widened. It puts the knowledge that a strand is artificial
into `rules.ts`, which then has to carry it without ever using it, and it leaves
the six sites above no better off. Reconsider only if a bot ever needs the
rulebook to treat its strand differently, which would itself be a bug.

**A `Snake.controller` field (rejected).** Superficially the same split, but it
threads the fact through every value `step` produces and every test that builds
a `Snake` by hand. Occupancy belongs to the match, not to the strand.

## Consequences

- **`sauceFor`, `seatsOf`, `seatAt` and `keyAction` take occupancy rather than
  mode.** Each was already asking one of the six questions above; they now say
  which. `seatsOf` splits in two — message cards are drawn once per *reader*,
  score cards once per *strand* — which is the distinction a duel never needed
  because there both sets are the same two seats.

- **`rules.ts` and its 50 tests are untouched by this feature**, and stay the
  authority on what a legal move is. The bot obeys the reversal rule and the
  queue cap because it goes through `turn()`, not because it reimplements them.

- **Bot versus bot costs nothing.** Two bot controllers is not a case anyone has
  to write code for — it is two seats whose controllers happen not to be people.
  An attract-mode demo behind the title card is a call site, not a feature.

- **The i18n bag grows a `personas` entry.** `Play.tsx` cannot pre-format the
  round and win strings for `top` any more, because that seat's name now depends
  on which persona was chosen. It resolves all five up front instead, which
  keeps every `format` call in the one file that is allowed to make them.
