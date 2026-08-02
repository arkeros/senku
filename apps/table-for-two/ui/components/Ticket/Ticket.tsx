import * as stylex from "@stylexjs/stylex";
import type { Seat } from "../../../game/rules";
import { color, font } from "../../theme/tokens.stylex";

type TicketProps = {
  scores: Readonly<Record<Seat, number>>;
  /** Points needed to win — how many boxes to print per side. */
  target: number;
  /** The one line of status, printed both ways up. */
  meta: string;
  action?: { label: string; onPress: () => void } | null;
};

const stamped = stylex.keyframes({
  from: { transform: "scale(.2)" },
  to: { transform: "scale(1)" },
});

const styles = stylex.create({
  ticket: {
    flexGrow: 0,
    flexShrink: 0,
    display: "flex",
    alignItems: "stretch",
    backgroundColor: color.paper,
    color: color.booth,
    fontFamily: font.mono,
    // Tear-off perforations top and bottom, like a till receipt.
    borderTopWidth: 3,
    borderTopStyle: "dashed",
    borderTopColor: color.booth,
    borderBottomWidth: 3,
    borderBottomStyle: "dashed",
    borderBottomColor: color.booth,
  },
  marks: {
    flexGrow: 0,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 5,
    paddingBlock: 10,
    paddingInline: 12,
  },
  mark: {
    width: 11,
    height: 11,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "rgba(14, 26, 23, 0.35)",
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  marked: {
    borderColor: "transparent",
    animationName: stamped,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  markedTop: { backgroundColor: color.mustard },
  markedBottom: { backgroundColor: color.chilli },

  center: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingBlock: 8,
    paddingInline: 4,
    overflow: "hidden",
  },
  meta: {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  flipped: { transform: "rotate(180deg)" },
  action: {
    borderStyle: "none",
    backgroundColor: color.booth,
    color: color.paper,
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.18em",
    paddingBlock: 8,
    paddingInline: 14,
    borderRadius: 3,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    lineHeight: 1.1,
    outline: {
      default: "none",
      ":focus-visible": `3px solid ${color.chilli}`,
    },
    outlineOffset: 2,
  },
});

function Marks({ seat, score, target }: { seat: Seat; score: number; target: number }) {
  return (
    <div {...stylex.props(styles.marks)}>
      {Array.from({ length: target }, (_unused, i) => (
        <span
          key={i}
          {...stylex.props(
            styles.mark,
            i < score && styles.marked,
            i < score && (seat === "top" ? styles.markedTop : styles.markedBottom),
          )}
        />
      ))}
    </div>
  );
}

/**
 * The order slip between the two players: a row of boxes each, and one status
 * line printed twice so both sides can read it without turning the phone.
 */
export function Ticket({ scores, target, meta, action = null }: TicketProps) {
  return (
    <div {...stylex.props(styles.ticket)}>
      <Marks seat="top" score={scores.top} target={target} />
      <div {...stylex.props(styles.center)}>
        <p {...stylex.props(styles.meta, styles.flipped)}>{meta}</p>
        {action ? (
          <button type="button" onClick={action.onPress} {...stylex.props(styles.action)}>
            <span {...stylex.props(styles.flipped)}>{action.label}</span>
            <span>{action.label}</span>
          </button>
        ) : null}
        <p {...stylex.props(styles.meta)}>{meta}</p>
      </div>
      <Marks seat="bottom" score={scores.bottom} target={target} />
    </div>
  );
}
