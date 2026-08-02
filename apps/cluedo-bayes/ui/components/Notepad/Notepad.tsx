import * as stylex from "@stylexjs/stylex";
import { ENVELOPE, PLAYER_COUNT, type CardId } from "../../../game/cards";
import type { Solution } from "../../../game/solver";
import { color, font } from "../../theme/tokens.stylex";

export type NotepadView = "envelope" | "hands";

type Row = { card: CardId; label: string };

type NotepadProps = {
  heading: string;
  /** Shannon entropy of the envelope, in bits. */
  bits: number;
  worldCount: number;
  /** Cards in the currently selected category, already translated. */
  rows: readonly Row[];
  solution: Solution;
  /** Cards the reader holds; excluded from the who-holds-what grid. */
  ownHand: readonly CardId[];
  view: NotepadView;
  onToggleView: () => void;
  /** Column headings for the grid: the three opponents plus the envelope. */
  columnLabels: readonly [string, string, string, string];
  toggleLabel: string;
  categoryTotalLabel: string;
  conservationNote: string;
  leadingTheory?: { label: string; percent: number; nudge: string | null } | null;
  leadingTheoryLabel: string;
  children?: React.ReactNode;
};

const styles = stylex.create({
  panel: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    padding: 12,
    marginBottom: 12,
    fontFamily: font.serif,
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
    gap: 8,
  },
  heading: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.3em",
    color: color.gold,
    margin: 0,
  },
  readout: { fontFamily: font.mono, fontSize: 10, color: color.dim },
  urgent: { color: color.red },
  quiet: { color: color.faint },

  toolbar: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  toggle: {
    marginInlineStart: "auto",
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
    paddingBlock: 4,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.gold,
    backgroundColor: "transparent",
    color: color.gold,
    cursor: "pointer",
  },

  row: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },
  rowName: { width: 96, fontSize: 12, color: color.ink },
  struck: { color: color.faint, textDecoration: "line-through" },
  track: {
    flexGrow: 1,
    height: 10,
    backgroundColor: color.well,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    position: "relative",
  },
  fill: {
    position: "absolute",
    insetBlock: 1,
    insetInlineStart: 1,
    backgroundImage: `linear-gradient(90deg, ${color.redDeep}, ${color.red})`,
    transitionProperty: "width",
    transitionDuration: "500ms",
  },
  fillCertain: { backgroundImage: "none", backgroundColor: color.gold },
  percent: {
    width: 40,
    textAlign: "right",
    fontFamily: font.mono,
    fontSize: 11,
    color: color.dim,
  },
  certain: { color: color.gold },

  gridHead: {
    display: "flex",
    gap: 8,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  gridSpacer: { width: 82 },
  gridCol: {
    flexGrow: 1,
    textAlign: "center",
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: "0.1em",
    color: color.faint,
  },
  gridRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 4 },
  gridName: { width: 82, fontSize: 11, color: color.ink },
  cell: {
    flexGrow: 1,
    textAlign: "center",
    fontFamily: font.mono,
    fontSize: 11,
    paddingBlock: 3,
    borderRadius: 2,
    color: color.dim,
  },
  cellGone: { color: color.faint },
  cellHas: { backgroundColor: "#3A3020", color: color.gold, fontWeight: 700 },
  cellEnvelope: { backgroundColor: color.redDeep, color: "#fff", fontWeight: 700 },
  totals: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  totalsName: { width: 82, fontSize: 11, color: color.gold, fontFamily: font.mono },
  note: { marginTop: 8, fontSize: 10.5, color: color.faint, fontStyle: "italic", lineHeight: 1.5 },
  theory: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: color.line,
    fontSize: 12,
    color: color.dim,
  },
  theoryCards: { color: color.ink },
});

const pct = (p: number) => Math.round(p * 100);

export function Notepad({
  heading,
  bits,
  worldCount,
  rows,
  solution,
  ownHand,
  view,
  onToggleView,
  columnLabels,
  toggleLabel,
  categoryTotalLabel,
  conservationNote,
  leadingTheory,
  leadingTheoryLabel,
  children,
}: NotepadProps) {
  const envelopeRows = [...rows]
    .map((r) => ({ ...r, p: solution.envelopeProb.get(r.card) ?? 0 }))
    .sort((a, b) => b.p - a.p);

  const gridRows = rows.filter((r) => !ownHand.includes(r.card));
  // Columns are the three opponents plus the envelope; the reader's own column
  // is omitted because every cell in it would be a certainty.
  const columns = [1, 2, 3, ENVELOPE];

  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.heading)}>{heading}</h2>
        <span {...stylex.props(styles.readout)}>
          H = <span {...stylex.props(bits < 1 && styles.urgent)}>{bits.toFixed(2)}</span> bits
          <span {...stylex.props(styles.quiet)}> · {worldCount}</span>
        </span>
      </div>

      <div {...stylex.props(styles.toolbar)}>
        {children}
        <button type="button" onClick={onToggleView} {...stylex.props(styles.toggle)}>
          {toggleLabel}
        </button>
      </div>

      {view === "envelope"
        ? envelopeRows.map(({ card, label, p }) => (
            <div key={card} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowName, p === 0 && styles.struck)}>{label}</span>
              <span {...stylex.props(styles.track)}>
                <span
                  {...stylex.props(styles.fill, p >= 0.999 && styles.fillCertain)}
                  style={{ width: `${pct(p)}%` }}
                />
              </span>
              <span
                {...stylex.props(
                  styles.percent,
                  p >= 0.999 && styles.certain,
                  p === 0 && styles.cellGone,
                )}
              >
                {p === 0 ? "✗" : `${pct(p)}%`}
              </span>
            </div>
          ))
        : (
          <div>
            <div {...stylex.props(styles.gridHead)}>
              <span {...stylex.props(styles.gridSpacer)} />
              {columnLabels.map((c) => (
                <span key={c} {...stylex.props(styles.gridCol)}>
                  {c}
                </span>
              ))}
            </div>
            {gridRows.map(({ card, label }) => {
              const spread = solution.locationProb.get(card) ?? Array(PLAYER_COUNT + 1).fill(0);
              return (
                <div key={card} {...stylex.props(styles.gridRow)}>
                  <span {...stylex.props(styles.gridName)}>{label}</span>
                  {columns.map((col) => {
                    const p = spread[col];
                    const certain = p >= 0.995;
                    const gone = p <= 0.005;
                    return (
                      <span
                        key={col}
                        {...stylex.props(
                          styles.cell,
                          gone && styles.cellGone,
                          certain && (col === ENVELOPE ? styles.cellEnvelope : styles.cellHas),
                        )}
                      >
                        {gone ? "—" : certain ? (col === ENVELOPE ? "★" : "✓") : `${pct(p)}%`}
                      </span>
                    );
                  })}
                </div>
              );
            })}
            <div {...stylex.props(styles.totals)}>
              <span {...stylex.props(styles.totalsName)}>{categoryTotalLabel}</span>
              {columns.map((col) => {
                const sum = gridRows.reduce(
                  (acc, r) => acc + ((solution.locationProb.get(r.card) ?? [])[col] ?? 0),
                  0,
                );
                return (
                  <span
                    key={col}
                    {...stylex.props(styles.cell, col === ENVELOPE && styles.certain)}
                  >
                    {sum.toFixed(2)}
                  </span>
                );
              })}
            </div>
            <p {...stylex.props(styles.note)}>{conservationNote}</p>
          </div>
        )}

      {leadingTheory && (
        <p {...stylex.props(styles.theory)}>
          {leadingTheoryLabel}{" "}
          <span {...stylex.props(styles.theoryCards)}>{leadingTheory.label}</span>{" "}
          <span {...stylex.props(styles.readout, leadingTheory.percent > 90 && styles.certain)}>
            ({leadingTheory.percent}%)
          </span>
          {leadingTheory.nudge && <span {...stylex.props(styles.urgent)}> — {leadingTheory.nudge}</span>}
        </p>
      )}
    </section>
  );
}
