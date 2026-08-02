import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@panellet/i18n-runtime";
import {
  ALL_CARDS,
  PLAYER_COUNT,
  ROOMS,
  SUSPECTS,
  WEAPONS,
  deal,
  type CardId,
  type Category,
  type PlayerIndex,
} from "../../game/cards";
import {
  bestSuggestion,
  envelopeEntropy,
  expectedGain,
} from "../../game/information";
import { newKnowledge, type Knowledge } from "../../game/knowledge";
import { solve, type Solution } from "../../game/solver";
import {
  broadcast,
  firstResponder,
  newShowHistory,
  recordShow,
  type ShowHistory,
} from "../../game/table";
import { CaseLog, type Entry, type Tone } from "../../ui/components/CaseLog/CaseLog";
import { Chip } from "../../ui/components/Chip/Chip";
import { Notepad, type NotepadView } from "../../ui/components/Notepad/Notepad";
import { color, font } from "../../ui/theme/tokens.stylex";

/** Pauses that make the bots feel like they are thinking rather than lagging. */
const BOT_THINK_MS = 1100;
const BOT_ANSWER_MS = 900;
const BEAT_MS = 1100;

/** A bot accuses once its leading theory is this certain, with enough support. */
const ACCUSE_AT = 0.97;
const ACCUSE_MIN_WORLDS = 100;

type Phase = "userTurn" | "botThinking" | "userShow" | "over";

interface Match {
  envelope: readonly CardId[];
  hands: CardId[][];
  knowledge: Knowledge[];
  history: ShowHistory;
  turn: PlayerIndex;
  eliminated: boolean[];
  log: Entry[];
  phase: Phase;
  pendingShow: {
    suggester: PlayerIndex;
    suggestion: readonly CardId[];
    options: CardId[];
    passers: readonly PlayerIndex[];
  } | null;
  winner: PlayerIndex | null;
  revealed: readonly CardId[] | null;
  nextLogId: number;
}

function freshMatch(): Match {
  const d = deal(Math.random);
  return {
    envelope: d.envelope,
    hands: d.hands.map((h) => [...h]),
    knowledge: d.hands.map((h, p) => newKnowledge(p as PlayerIndex, h)),
    history: newShowHistory(),
    turn: 0,
    eliminated: Array(PLAYER_COUNT).fill(false),
    log: [],
    phase: "userTurn",
    pendingShow: null,
    winner: null,
    revealed: null,
    nextLogId: 1,
  };
}

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: color.bg,
    color: color.ink,
    fontFamily: font.serif,
    paddingTop: 14,
    paddingInline: 12,
    paddingBottom: 40,
    maxWidth: 560,
    marginInline: "auto",
  },
  masthead: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: color.red,
    paddingBottom: 10,
    marginBottom: 12,
  },
  caseNo: { fontSize: 10, letterSpacing: "0.4em", color: color.dim, fontFamily: font.mono },
  title: { margin: 0, marginTop: 2, fontSize: 24, fontWeight: 400, letterSpacing: 1 },
  titleAccent: { color: color.red, fontStyle: "italic" },
  status: { fontSize: 12, color: color.dim, marginTop: 2, marginBottom: 0 },

  verdict: {
    backgroundColor: color.panelRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.gold,
    padding: 12,
    marginBottom: 12,
    textAlign: "center",
  },
  verdictLabel: { fontFamily: font.mono, fontSize: 10, letterSpacing: "0.3em", color: color.gold },
  verdictCards: { fontSize: 18, marginTop: 4 },

  block: { marginBottom: 12 },
  blockLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.3em",
    color: color.dim,
    marginBottom: 5,
  },
  cardRow: { display: "flex", flexWrap: "wrap", gap: 5 },
  handCard: {
    fontSize: 12,
    paddingBlock: 4,
    paddingInline: 9,
    backgroundColor: color.panelRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: 2,
  },

  panel: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    padding: 12,
    marginBottom: 12,
  },
  alert: { backgroundColor: color.panelRaised, borderColor: color.red },
  modeRow: { display: "flex", gap: 6, marginBottom: 10 },
  modeButton: {
    flexGrow: 1,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: "0.2em",
    padding: 6,
    backgroundColor: "transparent",
    color: color.dim,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    cursor: "pointer",
  },
  modeOnSuggest: { backgroundColor: color.ink, color: color.bg },
  modeOnAccuse: { backgroundColor: color.red, borderColor: color.red, color: "#fff" },

  catLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: "0.2em",
    color: color.faint,
    marginBottom: 4,
  },
  readout: {
    backgroundColor: color.well,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.line,
    paddingBlock: 8,
    paddingInline: 10,
    marginBlock: 6,
    marginBottom: 10,
    fontSize: 12,
  },
  readoutRow: { display: "flex", justifyContent: "space-between", gap: 8 },
  readoutSplit: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  goldMono: { fontFamily: font.mono, color: color.gold },
  faintMono: { fontFamily: font.mono, color: color.faint },
  useButton: {
    fontFamily: font.mono,
    fontSize: 10,
    paddingBlock: 3,
    paddingInline: 8,
    backgroundColor: "transparent",
    color: color.gold,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.gold,
    borderRadius: 2,
    cursor: "pointer",
  },
  commit: {
    width: "100%",
    paddingBlock: 9,
    fontFamily: font.serif,
    fontSize: 14,
    borderStyle: "none",
    borderRadius: 2,
    cursor: "pointer",
    backgroundColor: color.gold,
    color: color.onGold,
  },
  commitAccuse: { backgroundColor: color.red, color: "#fff" },
  commitDisabled: { opacity: 0.4, cursor: "default" },
  tabRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
    paddingBlock: 4,
    paddingInline: 10,
    backgroundColor: "transparent",
    color: color.faint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    cursor: "pointer",
  },
  tabOn: { backgroundColor: color.panelRaised, color: color.ink, borderColor: color.dim },
  newCase: {
    marginTop: 10,
    fontFamily: font.serif,
    fontSize: 13,
    paddingBlock: 7,
    paddingInline: 18,
    backgroundColor: color.red,
    color: "#fff",
    borderStyle: "none",
    borderRadius: 2,
    cursor: "pointer",
  },
  hint: { fontSize: 11, color: color.dim, marginTop: 8, fontStyle: "italic" },
  footnote: { marginTop: 14, fontSize: 11, color: color.faint, lineHeight: 1.5 },
});

export function Play() {
  const { format } = useI18n();

  // The match is held in a ref and mutated. Deduction state is a graph of Maps
  // and Sets that the `learn*` helpers update in place, so cloning it on every
  // event would mean rebuilding the whole notebook each turn for no benefit.
  // `revision` is the single piece of React state that drives re-rendering.
  const matchRef = useRef<Match | null>(null);
  const [revision, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Every translated string. i18n ids must be literals for the build-time
  // coverage check, so the card and player tables are written out rather than
  // looked up by concatenating an id.
  const cardName: Record<CardId, string> = {
    scarlett: format("cb.card.scarlett"),
    mustard: format("cb.card.mustard"),
    plum: format("cb.card.plum"),
    green: format("cb.card.green"),
    peacock: format("cb.card.peacock"),
    orchid: format("cb.card.orchid"),
    rope: format("cb.card.rope"),
    candlestick: format("cb.card.candlestick"),
    revolver: format("cb.card.revolver"),
    knife: format("cb.card.knife"),
    wrench: format("cb.card.wrench"),
    leadPipe: format("cb.card.leadPipe"),
    kitchen: format("cb.card.kitchen"),
    ballroom: format("cb.card.ballroom"),
    conservatory: format("cb.card.conservatory"),
    diningRoom: format("cb.card.diningRoom"),
    library: format("cb.card.library"),
    lounge: format("cb.card.lounge"),
    hall: format("cb.card.hall"),
    study: format("cb.card.study"),
    billiardRoom: format("cb.card.billiardRoom"),
  };
  const playerName = [
    format("cb.player.you"),
    format("cb.player.anna"),
    format("cb.player.ben"),
    format("cb.player.cara"),
  ];
  const categoryLabel: Record<Category, string> = {
    suspect: format("cb.category.suspect"),
    weapon: format("cb.category.weapon"),
    room: format("cb.category.room"),
  };
  const list = (cards: readonly CardId[]) => cards.map((c) => cardName[c]).join(", ");

  if (matchRef.current === null) {
    const started = freshMatch();
    started.log.push({ id: started.nextLogId++, tone: "info", text: format("cb.setup") });
    matchRef.current = started;
  }
  const m = matchRef.current;

  const say = (tone: Tone, text: string) => {
    m.log.push({ id: m.nextLogId++, tone, text });
  };

  const [solution, setSolution] = useState<Solution>(() => solve(m.knowledge[0]));
  const resolveAgain = () => setSolution(solve(matchRef.current!.knowledge[0]));

  const [selection, setSelection] = useState<Partial<Record<Category, CardId>>>({});
  const [mode, setMode] = useState<"suggest" | "accuse">("suggest");
  const [tab, setTab] = useState<Category>("suspect");
  const [view, setView] = useState<NotepadView>("envelope");

  const bits = useMemo(
    () => (solution.worlds.length ? envelopeEntropy(solution.worlds) : 0),
    [solution],
  );
  const best = useMemo(() => {
    if (m.phase !== "userTurn" || m.eliminated[0]) return null;
    return bestSuggestion(solution, 0);
  }, [solution, m.phase, m.eliminated, revision]);
  const chosenTriple =
    selection.suspect && selection.weapon && selection.room
      ? ([selection.suspect, selection.weapon, selection.room] as const)
      : null;
  const chosenGain = useMemo(
    () => (chosenTriple ? expectedGain(solution, 0, chosenTriple) : null),
    [chosenTriple, solution],
  );

  // ---- flow ------------------------------------------------------------
  function finish(winner: PlayerIndex | null) {
    m.phase = "over";
    m.winner = winner;
    m.revealed = m.envelope;
    rerender();
  }

  /** Returns true when the accusation was right and the match is over. */
  function judgeAccusation(p: PlayerIndex, triple: readonly CardId[]): boolean {
    const right = triple.every((c) => m.envelope.includes(c));
    if (right) {
      say("win", format("cb.log.correct", { name: playerName[p], cards: list(triple) }));
      finish(p);
      return true;
    }
    m.eliminated[p] = true;
    say("bad", format("cb.log.wrong", { name: playerName[p], cards: list(triple) }));
    if (m.eliminated.every(Boolean)) {
      say("info", format("cb.log.allOut", { cards: list(m.envelope) }));
      finish(null);
      return true;
    }
    rerender();
    return false;
  }

  function advance() {
    if (m.phase === "over") return;
    // Guard against the all-eliminated case, which would otherwise recurse
    // forever looking for someone still in the game.
    for (let step = 1; step <= PLAYER_COUNT; step++) {
      const next = ((m.turn + step) % PLAYER_COUNT) as PlayerIndex;
      if (m.eliminated[next]) continue;
      m.turn = next;
      if (next === 0) {
        m.phase = "userTurn";
        resolveAgain();
      } else {
        m.phase = "botThinking";
        after(BOT_THINK_MS, () => takeBotTurn(next));
      }
      rerender();
      return;
    }
    finish(null);
  }

  function takeBotTurn(p: PlayerIndex) {
    if (m.phase === "over") return;
    const theirs = solve(m.knowledge[p]);

    if (
      theirs.topTheory &&
      theirs.topTheory.p > ACCUSE_AT &&
      theirs.accepted > ACCUSE_MIN_WORLDS
    ) {
      if (judgeAccusation(p, theirs.topTheory.cards)) return;
      after(BEAT_MS, advance);
      return;
    }

    const scored = bestSuggestion(theirs, p);
    if (!scored) {
      after(BEAT_MS, advance);
      return;
    }
    say(
      "suggest",
      format("cb.log.botSuggest", {
        name: playerName[p],
        cards: list(scored.suggestion),
        bits: scored.bits.toFixed(2),
      }),
    );
    rerender();
    after(BOT_ANSWER_MS, () => answerBot(p, scored.suggestion));
  }

  function answerBot(suggester: PlayerIndex, suggestion: readonly CardId[]) {
    if (m.phase === "over") return;
    const passers: PlayerIndex[] = [];

    for (let step = 1; step < PLAYER_COUNT; step++) {
      const r = ((suggester + step) % PLAYER_COUNT) as PlayerIndex;
      const matches = suggestion.filter((c) => m.hands[r].includes(c));
      if (matches.length === 0) {
        passers.push(r);
        continue;
      }
      if (r !== 0) {
        const response = firstResponder(m.hands, suggester, suggestion, m.history, Math.random);
        settleShow(suggester, suggestion, response.shower!, response.card!, response.passers);
        return;
      }
      // The human is the responder. With one match there is no decision to make.
      if (matches.length === 1) {
        settleShow(suggester, suggestion, 0, matches[0], passers);
        return;
      }
      m.phase = "userShow";
      m.pendingShow = { suggester, suggestion, options: matches, passers };
      say(
        "info",
        format("cb.log.youHoldSeveral", {
          count: matches.length,
          name: playerName[suggester],
        }),
      );
      rerender();
      return;
    }

    broadcast(m.knowledge, suggester, suggestion, { shower: null, card: null, passers });
    say("hot", format("cb.log.nobodyBot", { name: playerName[suggester] }));
    resolveAgain();
    rerender();
    after(BEAT_MS, advance);
  }

  function settleShow(
    suggester: PlayerIndex,
    suggestion: readonly CardId[],
    shower: PlayerIndex,
    card: CardId,
    passers: readonly PlayerIndex[],
  ) {
    recordShow(m.history, shower, suggester, card);
    broadcast(m.knowledge, suggester, suggestion, { shower, card, passers });
    if (shower === 0) {
      say("show", format("cb.log.youShow", { name: playerName[suggester], card: cardName[card] }));
    } else {
      say(
        "show",
        format("cb.log.otherShows", {
          shower: playerName[shower],
          viewer: playerName[suggester],
        }),
      );
    }
    m.pendingShow = null;
    resolveAgain();
    rerender();
    after(BEAT_MS, advance);
  }

  function commit() {
    if (!chosenTriple) return;
    if (mode === "accuse") {
      say("suggest", format("cb.log.youAccuse", { cards: list(chosenTriple) }));
      const done = judgeAccusation(0, chosenTriple);
      setSelection({});
      if (!done) after(BEAT_MS, advance);
      return;
    }

    say(
      "suggest",
      format("cb.log.youSuggest", {
        cards: list(chosenTriple),
        bits: (chosenGain ?? 0).toFixed(2),
      }),
    );
    const response = firstResponder(m.hands, 0, chosenTriple, m.history, Math.random);
    if (response.shower !== null && response.card !== null) {
      recordShow(m.history, response.shower, 0, response.card);
      broadcast(m.knowledge, 0, chosenTriple, response);
      say(
        "show",
        format("cb.log.showsYou", {
          name: playerName[response.shower],
          card: cardName[response.card],
        }),
      );
    } else {
      broadcast(m.knowledge, 0, chosenTriple, response);
      say("hot", format("cb.log.nobodyYou"));
    }
    setSelection({});
    resolveAgain();
    rerender();
    after(BEAT_MS, advance);
  }

  function restart() {
    clearTimers();
    const started = freshMatch();
    started.log.push({ id: started.nextLogId++, tone: "info", text: format("cb.setup") });
    matchRef.current = started;
    setSelection({});
    setMode("suggest");
    setSolution(solve(started.knowledge[0]));
    rerender();
  }

  // An eliminated human still has to show cards, but takes no turns.
  useEffect(() => {
    if (m.phase === "userTurn" && m.eliminated[0]) after(800, advance);
    // Depends on the revision counter, not on the mutable match: without that
    // this would re-arm a timer on every single render.
  }, [revision, m.phase]);

  // ---- render ----------------------------------------------------------
  const categoryCards: Record<Category, readonly CardId[]> = {
    suspect: SUSPECTS,
    weapon: WEAPONS,
    room: ROOMS,
  };
  const rows = categoryCards[tab].map((card) => ({ card, label: cardName[card] }));

  const status = () => {
    if (m.phase === "over") {
      if (m.winner === 0) return format("cb.status.youSolved");
      if (m.winner !== null) return format("cb.status.theySolved", { name: playerName[m.winner] });
      return format("cb.status.unsolved");
    }
    if (m.phase === "userShow") return format("cb.status.choose");
    return m.turn === 0
      ? format("cb.status.yourMove")
      : format("cb.status.thinking", { name: playerName[m.turn] });
  };

  const theory = solution.topTheory
    ? {
        label: list(solution.topTheory.cards),
        percent: Math.round(solution.topTheory.p * 100),
        nudge: solution.topTheory.p > 0.95 ? format("cb.timeToAccuse") : null,
      }
    : null;

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.masthead)}>
        <p {...stylex.props(styles.caseNo)}>{format("cb.caseNumber")}</p>
        <h1 {...stylex.props(styles.title)}>
          Cluedo <span {...stylex.props(styles.titleAccent)}>vs. Bayes</span>
        </h1>
        <p aria-live="polite" {...stylex.props(styles.status)}>
          {status()}
        </p>
      </header>

      {m.phase === "over" && m.revealed && (
        <div {...stylex.props(styles.verdict)}>
          <p {...stylex.props(styles.verdictLabel)}>{format("cb.envelopeHeld")}</p>
          <p {...stylex.props(styles.verdictCards)}>{list(m.revealed)}</p>
          <button type="button" onClick={restart} {...stylex.props(styles.newCase)}>
            {format("cb.newCase")}
          </button>
        </div>
      )}

      <section {...stylex.props(styles.block)}>
        <h2 {...stylex.props(styles.blockLabel)}>{format("cb.yourHand")}</h2>
        <div {...stylex.props(styles.cardRow)}>
          {m.hands[0].map((c) => (
            <span key={c} {...stylex.props(styles.handCard)}>
              {cardName[c]}
            </span>
          ))}
        </div>
      </section>

      {m.phase === "userShow" && m.pendingShow && (
        <section {...stylex.props(styles.panel, styles.alert)}>
          <p style={{ marginTop: 0 }}>
            {format("cb.showPrompt", {
              name: playerName[m.pendingShow.suggester],
              cards: list(m.pendingShow.suggestion),
            })}
          </p>
          <div {...stylex.props(styles.cardRow)}>
            {m.pendingShow.options.map((c) => (
              <Chip
                key={c}
                label={cardName[c]}
                onPress={() =>
                  settleShow(
                    m.pendingShow!.suggester,
                    m.pendingShow!.suggestion,
                    0,
                    c,
                    m.pendingShow!.passers,
                  )
                }
              />
            ))}
          </div>
          <p {...stylex.props(styles.hint)}>{format("cb.showTip")}</p>
        </section>
      )}

      {m.phase === "userTurn" && !m.eliminated[0] && (
        <section {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.modeRow)}>
            <button
              type="button"
              onClick={() => setMode("suggest")}
              {...stylex.props(styles.modeButton, mode === "suggest" && styles.modeOnSuggest)}
            >
              {format("cb.suggest")}
            </button>
            <button
              type="button"
              onClick={() => setMode("accuse")}
              {...stylex.props(styles.modeButton, mode === "accuse" && styles.modeOnAccuse)}
            >
              {format("cb.accuse")}
            </button>
          </div>

          {(["suspect", "weapon", "room"] as const).map((cat) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <p {...stylex.props(styles.catLabel)}>{categoryLabel[cat]}</p>
              <div {...stylex.props(styles.cardRow)}>
                {categoryCards[cat].map((c) => (
                  <Chip
                    key={c}
                    small
                    label={cardName[c]}
                    selected={selection[cat] === c}
                    ruledOut={(solution.envelopeProb.get(c) ?? 0) === 0}
                    onPress={() => setSelection((s) => ({ ...s, [cat]: c }))}
                  />
                ))}
              </div>
            </div>
          ))}

          {mode === "suggest" && (
            <div {...stylex.props(styles.readout)}>
              <div {...stylex.props(styles.readoutRow)}>
                <span style={{ color: "inherit" }}>{format("cb.thisExperiment")}</span>
                <span {...stylex.props(chosenGain != null ? styles.goldMono : styles.faintMono)}>
                  {chosenGain != null
                    ? format("cb.bits", { bits: chosenGain.toFixed(2) })
                    : format("cb.pickThree")}
                </span>
              </div>
              {best && (
                <div {...stylex.props(styles.readoutSplit)}>
                  <span style={{ fontSize: 11 }}>
                    {format("cb.bestFound")} {list(best.suggestion)}{" "}
                    <span {...stylex.props(styles.goldMono)}>
                      {format("cb.bits", { bits: best.bits.toFixed(2) })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelection({
                        suspect: best.suggestion[0],
                        weapon: best.suggestion[1],
                        room: best.suggestion[2],
                      })
                    }
                    {...stylex.props(styles.useButton)}
                  >
                    {format("cb.use")}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={commit}
            disabled={!chosenTriple}
            {...stylex.props(
              styles.commit,
              mode === "accuse" && styles.commitAccuse,
              !chosenTriple && styles.commitDisabled,
            )}
          >
            {mode === "accuse" ? format("cb.makeAccusation") : format("cb.makeSuggestion")}
          </button>
        </section>
      )}

      <Notepad
        heading={format("cb.notepad")}
        bits={bits}
        worldCount={solution.accepted}
        rows={rows}
        solution={solution}
        ownHand={m.hands[0]}
        view={view}
        onToggleView={() => setView((v) => (v === "envelope" ? "hands" : "envelope"))}
        toggleLabel={view === "envelope" ? format("cb.whoHolds") : format("cb.backToEnvelope")}
        columnLabels={[
          playerName[1],
          playerName[2],
          playerName[3],
          format("cb.columnEnvelope"),
        ]}
        categoryTotalLabel={format("cb.categoryTotal")}
        conservationNote={format("cb.conservation")}
        leadingTheory={theory}
        leadingTheoryLabel={format("cb.leadingTheory")}
      >
        <div {...stylex.props(styles.tabRow)}>
          {(["suspect", "weapon", "room"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              {...stylex.props(styles.tab, tab === t && styles.tabOn)}
            >
              {categoryLabel[t]}
            </button>
          ))}
        </div>
      </Notepad>

      <CaseLog heading={format("cb.caseLog")} entries={m.log} />

      <p {...stylex.props(styles.footnote)}>{format("cb.footnote")}</p>
    </div>
  );
}
