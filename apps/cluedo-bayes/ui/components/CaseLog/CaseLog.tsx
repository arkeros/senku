import * as stylex from "@stylexjs/stylex";
import { color, font } from "../../theme/tokens.stylex";

/** How loud a log line should read. */
export type Tone = "info" | "suggest" | "show" | "hot" | "bad" | "win";

export type Entry = { readonly id: number; readonly tone: Tone; readonly text: string };

const styles = stylex.create({
  panel: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    padding: 12,
    fontFamily: font.serif,
  },
  heading: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.3em",
    color: color.dim,
    margin: 0,
    marginBottom: 8,
  },
  // Newest first, so the latest line needs no scrolling.
  scroll: {
    maxHeight: 220,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },
  line: {
    fontSize: 12,
    lineHeight: 1.45,
    paddingBlock: 5,
    margin: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(51, 44, 36, 0.5)",
    color: color.dim,
  },
  info: { fontStyle: "italic" },
  suggest: { color: color.ink },
  show: { color: color.ink },
  hot: { color: color.gold },
  bad: { color: color.red },
  win: { color: color.gold, fontWeight: 700 },
});

const TONE = {
  info: styles.info,
  suggest: styles.suggest,
  show: styles.show,
  hot: styles.hot,
  bad: styles.bad,
  win: styles.win,
} as const;

export function CaseLog({ heading, entries }: { heading: string; entries: readonly Entry[] }) {
  return (
    <section {...stylex.props(styles.panel)}>
      <h2 {...stylex.props(styles.heading)}>{heading}</h2>
      {/* A live region: the bots act on a timer, so their moves must be
          announced rather than only appearing. */}
      <div aria-live="polite" {...stylex.props(styles.scroll)}>
        {[...entries].reverse().map((e) => (
          <p key={e.id} {...stylex.props(styles.line, TONE[e.tone])}>
            {e.text}
          </p>
        ))}
      </div>
    </section>
  );
}
