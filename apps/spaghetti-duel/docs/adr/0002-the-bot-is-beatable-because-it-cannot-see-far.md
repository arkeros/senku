# The bot is beatable because it cannot see far

The flood fill that decides whether a move leaves room stops counting at
`horizon` cells and reports what it found. Below that distance a bot plays
perfectly — it will never enter a space smaller than itself — and beyond it, it
is blind. `horizon` is the only dial that decides whether a bot survives.
Nothing else in `bot.ts` is allowed to make it lose: there is no blunder rate, no
randomness of any kind, and no weight that can outvote safety.

## Why

A round ends when somebody crashes, and nothing else ends it. That single fact
rules out the obvious target. A competent snake bot with a full flood fill
essentially never traps itself, so every round would be decided by the human's
mistake and by nothing the bot did — a best-of-five that can only be lost, or
ground out by outliving something that does not tire. The bot has to be able to
lose. How it loses is therefore not a tuning detail, it is the design.

Space being a *gate* rather than a term is what forces the answer. The bot drops
every candidate whose reachable space is smaller than its own length before it
scores anything, so no combination of `appetite`, `menace` or `trade` can talk it
into a pocket. That is deliberate — it keeps the four axes independent, so
retuning aggression cannot silently retune survival, and it is what makes five
personas comprehensible one at a time. But it also means the bot cannot be made
weak by weighting it badly. If it is to lose at all, the loss has to come from
somewhere outside the scoring function, and perception is the only honest
candidate.

A capped fill also fails in the right *shape*. The bot handles the corner in
front of it and walks into the large slow trap you closed three moves ago,
because it genuinely could not see that far — which is how a decent human player
loses, and it is legible from the outside. Point at the board afterwards and the
mistake is there.

## Considered options

**A horizon on the flood fill (chosen).** One number, with a physical meaning,
that a test can pin without pinning any weight.

**A blunder rate — take a random safe move with probability *p* (rejected).**
One line, perfectly tunable, and the standard answer. It loses on the only
criterion that matters here: the player did not beat the bot, the bot lost a
coin toss. On screen it reads as a twitch rather than a mistake, and there is no
board state to point at afterwards. It also puts randomness into a module we
otherwise keep deterministic, for the reason recorded below.

**Difficulty tiers over one policy (rejected).** Would have made `horizon` a
player-facing setting. Personas are not rungs on a ladder — `MAYONESA` and
`BRAVA` are both `high` horizon and feel nothing alike — and exposing the dial
would have invited players to read the roster as ordered when it is not.

**Rubber-banding — raise the horizon as the human takes rounds (rejected).**
Makes the pips lie. A 2–0 lead should mean you are winning, not that the
opponent is about to change under you.

**Space as a weighted term rather than a gate (rejected).** Would have given
weakness for free: a high `appetite` outvotes safety and the bot dives into
pockets. But then `appetite` secretly controls survival, the axes stop being
independent, "why did it do that" stops having a short answer, and every persona
has to be retuned whenever any of them is.

**A full, uncapped flood fill (rejected).** The strongest bot, and the one that
turns every round into an endurance test against something that does not make
mistakes.

## Consequences

- **`appetite` is the pacing dial, not a difficulty dial.** A bot grows
  dangerous to itself only by eating, so a low appetite produces *long* rounds
  rather than a good opponent. `MAYONESA` is the persona most at risk of being
  dull, and the fix for it is appetite, not horizon.

- **No test may depend on the magnitude of a tuning constant.** Persona tests
  build boards where the gate, or the *sign* of a weight, forces the answer —
  `BRAVA` is tested with a free meatball behind it and the enemy head in front,
  asserting it turns toward the head, which is true at any positive `menace` and
  false at zero. A test that breaks when `horizon` moves from 50 to 60 is a
  wrong test.

- **`high` is not the whole board, and the ceiling is lower than it looks.**
  Measured on a 16×32 plate, a bot alone survives 668 moves at horizon 4–8, 953
  at 24, 1671 at 64 — and 2744 at 96, 160 and 512 alike. Sight stops buying
  anything at 96: past that it is the uncapped fill under another name, and the
  bot only ever dies because it ran out of plate. The roster's `high` is 64 for
  that reason. It was first written as 120, which measurement showed to be
  precisely the never-crashing opponent this ADR exists to forbid — the knee is
  a property of the board, so re-measure if the plate is ever recut.

- **The bot is deterministic, and stays that way.** Ties go to continuing
  straight — partly because a random tie-break makes the strand visibly wobble
  between two equally good options, and partly because once perception is the
  stated source of failure, any other source of failure undermines it. Variety
  comes from `spawnFood` and from the human, both of which are already random.

- **A capped fill is cheaper than the honest one.** Not why it was chosen, but
  worth knowing: the fill visits at most `horizon` cells per candidate, three
  candidates per move, which bounds the bot's cost independently of board size
  on a frame that also has to draw.
