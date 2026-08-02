import * as stylex from "@stylexjs/stylex";
import type { Player } from "../../../game/rules";
import { color, font, shadow } from "../../theme/tokens.stylex";

type BillProps = {
  heading: string;
  lines: readonly { player: Player; label: string; points: number }[];
  /** Who is ahead, or the final verdict once the tiles run out. */
  verdict: string;
};

/**
 * Torn-off bottom edge, the way a till receipt comes off the roll: everything
 * above the last 9px, plus a 13×9 tile repeated across that bottom band whose
 * opaque part is a 90° wedge pointing up from the tile's bottom centre.
 *
 * Two things here are load-bearing:
 *
 *  - Longhands, not the `mask` shorthand. StyleX keeps only `mask-image` out
 *    of a shorthand and silently drops position, size and repeat, which
 *    leaves the receipt with a plain straight edge.
 *  - The wedge is anchored at `50% 100%`, not `50% 0`. Anchored at the top,
 *    the wedge points up out of the tile and masks the whole band away —
 *    Firefox then renders a straight edge 9px short, with no zigzag at all.
 */
const zigzag = {
  maskImage:
    "linear-gradient(#000 0 0)," +
    " conic-gradient(from -45deg at 50% 100%, #000 90deg, #0000 0)",
  maskPosition: "top, bottom",
  maskSize: "100% calc(100% - 9px), 13px 9px",
  maskRepeat: "no-repeat, repeat-x",
} as const;

const styles = stylex.create({
  bill: {
    backgroundColor: color.paper,
    color: color.ink,
    paddingTop: 16,
    paddingInline: 16,
    paddingBottom: 22,
    boxShadow: shadow.bill,
    ...zigzag,
  },
  heading: {
    margin: 0,
    marginBottom: 12,
    fontSize: 11,
    letterSpacing: "0.3em",
    textIndent: "0.3em",
    textTransform: "uppercase",
    textAlign: "center",
  },
  line: {
    display: "flex",
    alignItems: "baseline",
    fontSize: 13,
    marginBlock: 7,
  },
  who: { whiteSpace: "nowrap" },
  // The dotted run between the name and the number, as on a printed bill.
  leader: {
    flexGrow: 1,
    borderBottomWidth: 1,
    borderBottomStyle: "dotted",
    borderBottomColor: "rgba(34, 48, 43, 0.4)",
    marginInline: 6,
    transform: "translateY(-3px)",
  },
  points: {
    fontWeight: font.weight7,
    fontVariantNumeric: "tabular-nums",
  },
  blue: { color: color.blue },
  red: { color: color.red },
  verdict: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(34, 48, 43, 0.35)",
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    textAlign: "center",
  },
});

export function Bill({ heading, lines, verdict }: BillProps) {
  return (
    <section {...stylex.props(styles.bill)}>
      <h2 {...stylex.props(styles.heading)}>{heading}</h2>
      {lines.map(({ player, label, points }) => (
        <p key={player} {...stylex.props(styles.line, styles[player])}>
          <span {...stylex.props(styles.who)}>{label}</span>
          <span aria-hidden="true" {...stylex.props(styles.leader)} />
          <span {...stylex.props(styles.points)}>{points}</span>
        </p>
      ))}
      <p {...stylex.props(styles.verdict)}>{verdict}</p>
    </section>
  );
}
