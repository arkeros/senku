# Spaghetti Duel

The words the plate is described in. The rulebook in `game/rules.ts` is the
authority on behaviour; this file is the authority on what things are called,
so the same idea is not three things by the time it reaches the canvas.

Nothing about buckets, bundles or deploys is in scope here — that is the
root [CONTEXT.md](../../CONTEXT.md).

## Language

### The plate

**Strand**:
One player's spaghetti: a head-first list of cells, a heading, and whether it
is still alive. `Snake` in the code, for the genre it comes from.
_Avoid_: snake (in prose), worm, player (a player *has* a strand)

**Seat**:
Which end of the table a strand belongs to — `bottom` or `top`. Fixed at the
start of a round and never changes. Purely a position; it says nothing about
who or what is steering.
_Avoid_: side, player (see **Controller**), team

**Mode**:
How many strands are on the plate — `solo` (one) or `duel` (two). It does
**not** say how many people are in the room.
_Avoid_: using "mode" for the choice of opponent (see **Persona**), difficulty

**Round**:
One deal, from the countdown to the first crash. Ends when any strand dies.
_Avoid_: game, life, match (a match is many rounds)

**Match**:
A whole sitting: best of five in a duel, a single round in solo.
_Avoid_: game, session

**Draw**:
A round in which every strand died on the same move — they met head-on, or
folded at the same moment. Nobody scores and the round is simply replayed.
Costs no one anything but time, which is why a **Trade** is not a neutral
outcome to design around.
_Avoid_: tie, stalemate

### Who is steering

**Controller**:
What supplies the headings for a seat — a pair of thumbs, a keyboard, or a
bot. Orthogonal to **Mode**: a duel is two strands whether or not there are
two people. A bot is a controller, never a rule, which is why nothing in
`rules.ts` knows one exists.
_Avoid_: player (ambiguous between the person and the seat), input, AI

**Reader**:
A seat with a human at it — someone the screen has to be legible *for*. Solo
and a bot match have one reader; a duel has two. Distinct from **Seat**
because a bot's strand has a score to show and nobody sitting there to read
it.
_Avoid_: viewer, audience, player

**Persona**:
A named bot opponent: one value of **Traits**, plus a name, a line of
description and a sauce. The thing a player chooses. A persona replaces the
top seat's name *and* its colour, so the plate says who you are playing from
any frame. Not a difficulty level — two personas may be equally hard and feel
nothing alike.
_Avoid_: difficulty, level, character, AI, personality

**Roster**:
The card the personas are chosen from, one row each, reached from the title
and backed out of without playing. The only place a persona's name and line
are drawn; in a match the far card shows the persona's name and the tag `BOT`.
_Avoid_: menu, select screen, difficulty screen, lobby

**Traits**:
The four numbers and one flag a **Persona** is made of. The whole of what
distinguishes one bot from another; there is one scoring function underneath
all of them.
_Avoid_: config, params, settings

**Horizon**:
How many cells of free space a bot counts before it stops looking. Its entire
sense of danger, and the honest way to make it beatable: below the horizon it
plays perfectly, above it, it is blind. A bot that dies did so for a reason on
the board. Space is a *gate*, not a term — a bot never trades safety for a
meatball, so every death is a horizon that was too short rather than a weight
that was too high.
_Avoid_: difficulty, depth, skill, lookahead (it is a flood fill, not a search)

**Appetite**:
How hard a bot steers toward a meatball. The **pacing** dial, not a flavour
one: a round ends when someone crashes, a bot grows dangerous to itself only
by eating, so a low appetite makes rounds *long* rather than the bot *good*.
Eating also speeds the plate up for both strands.
_Avoid_: greed, hunger, aggression (that is **Menace**)

**Menace**:
How hard a bot steers toward the cells in front of the other head — cutting
off, taking ground, driving a strand toward a wall. Never colliding; that is
**Trade**.
_Avoid_: aggression (ambiguous with **Trade**), difficulty

**Trade**:
How a bot scores a move that kills both strands — `refuse`, `neutral` or
`seek`. A stated trait rather than something a hunting bot is allowed to
discover, because a **Draw** costs the bot nothing and a bot free to trade
converges on manufacturing them.
_Avoid_: kamikaze (that is a persona, not the trait), suicide, sacrifice

## Relationships

- A **Seat** holds one **Strand** and is steered by one **Controller**
- **Mode** fixes how many seats are dealt; **Controller** fixes who steers them. A bot match is `duel` with a bot controlling `top`
- A **Reader** is a seat whose controller is human. **Placement follows the seat, orientation follows the reader**: a card sits at its strand's end of the table and is turned to face the nearest human. Message cards are drawn once per reader, score cards once per strand
- A **Persona** is a name, a line, a sauce and one value of **Traits**; every persona runs the same scoring function, and is chosen from the **Roster**
- A persona's sauce replaces the top seat's, so `sauceFor` follows what is *in* a seat rather than where the seat is
- **Horizon** is what a bot can see, **Appetite** and **Menace** are what it wants, **Trade** is what it will pay
- A bot produces headings and spends them through `turn` exactly as a flick does. It plans from the cell the head is *gliding into*, because `step` completes the current heading before taking a queued one

## Example dialogue

> **Dev:** "So a bot match is a third **Mode**?"
> **Domain expert:** "No. It's two strands, best of five — that's a `duel`. What changed is the **Controller** on the top **Seat**. If the rulebook could tell the difference we'd have put the bot in the wrong place."
> **Dev:** "Then why does the far score card look different?"
> **Domain expert:** "Because there's nobody at that end. The card is still at `top`, because that's whose score it is, but it's the right way up, because the only **Reader** is at the bottom. Placement follows the seat, orientation follows the reader."
> **Dev:** "And the countdown card — also once?"
> **Domain expert:** "Once. A duel draws it twice because there are two readers and one of them is upside down. Drawing it twice for a bot is fidelity to an empty chair."
> **Dev:** "Why not just make the bot brilliant and let people lose?"
> **Domain expert:** "Because a round only ends when somebody crashes. A bot that never crashes doesn't make a hard game, it makes a game where every round is decided by *your* mistake and nothing else. It has to be able to lose, and it has to lose for a reason — that's the **Horizon**."
> **Dev:** "Couldn't we just have it blunder now and then?"
> **Domain expert:** "Then it didn't lose to you, it lost to a die roll. With a horizon, it walks into the trap you built three moves ago because it genuinely couldn't see that far. Same outcome, and you earned it."
> **Dev:** "What stops the aggressive one from just driving into my face?"
> **Domain expert:** "**Trade**, and the fact that it's a stated trait. A **Draw** resets the round and scores nobody, so trading is free — a bot allowed to find that move will find it exactly when you're winning. **Menace** is taking the ground in front of you. Colliding is a different trait, and a persona only gets it if its card says so."

## Flagged ambiguities

- "player" meant the person, the seat and the strand interchangeably — resolved into **Controller** (who steers), **Seat** (where) and **Strand** (what).
- **Mode** conflated *how many strands* with *how many people*, which held until a bot filled a seat — resolved: mode counts strands, **Controller** counts people.
- `seatsOf(mode)` conflated *strands with a score* with *seats being read from*. Identical in solo and in a duel, different for the first time in a bot match — resolved into **Reader** and the placement/orientation rule above.
- "difficulty" was used for both **Horizon** and the choice between opponents — resolved: horizon is a trait, the choice is a **Persona**, and personas are not ordered.
- `sauceFor(seat)` read colour off *position*, which held while the top seat was always CARBONARA — resolved: colour follows the occupant, and a **Persona** brings its own.
