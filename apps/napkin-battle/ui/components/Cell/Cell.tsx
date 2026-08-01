import * as stylex from "@stylexjs/stylex";
import type { Mark, Player } from "../../../game/rules";
import { color, font } from "../../theme/tokens.stylex";

type CellProps = {
  /** Position on the board, in reading order. Only used to vary the tilt. */
  index: number;
  /** What is written here, or `null` if the cell is still blank. */
  mark: Mark | null;
  /** The coffee stain lives on exactly one cell; nothing can be written on it. */
  stained?: boolean;
  /** Whose pen would write here next — tints the blank-cell hover dot. */
  turn: Player;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

const styles = stylex.create({
  cell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    padding: 0,
    // Longhand, not the `background` shorthand: normalize.css paints buttons
    // via `background-color`, and a shorthand from StyleX does not reliably
    // beat it — the grid would end up as a dark block over the napkin.
    backgroundColor: color.transparent,
    fontFamily: font.written,
    fontWeight: font.weight7,
    fontSize: "clamp(30px, 10vw, 44px)",
    lineHeight: 1,
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.blue}`,
    },
    outlineOffset: "-4px",
  },
  blue: { color: color.blue },
  red: { color: color.red },
  /**
   * Blank cells show a faint dot in the colour of whoever is about to write,
   * so the napkin tells you whose turn it is without reading the header.
   */
  blank: {
    "::after": {
      content: "",
      width: "26%",
      height: "26%",
      borderRadius: "50%",
      backgroundColor: "currentColor",
      opacity: 0.14,
    },
  },
  stain: {
    cursor: "default",
    "::after": {
      content: "",
      width: "66%",
      height: "66%",
      transform: "rotate(-13deg)",
      // Deliberately lopsided radii: a spill is not an ellipse.
      borderRadius: "47% 53% 62% 38% / 56% 43% 57% 44%",
      backgroundImage:
        "radial-gradient(circle at 36% 32%, rgba(118,74,38,.40), rgba(118,74,38,.24) 56%, rgba(118,74,38,.09) 80%)",
      boxShadow: "inset 0 0 0 2px rgba(118,74,38,.16)",
    },
  },
});

/**
 * Seven fixed tilts, picked by cell index rather than at random, so numbers
 * look hand-written but do not jump around between renders.
 */
const tilts = stylex.create({
  t0: { transform: "rotate(-8deg)" },
  t1: { transform: "rotate(-5deg)" },
  t2: { transform: "rotate(6deg)" },
  t3: { transform: "rotate(2deg)" },
  t4: { transform: "rotate(-3deg)" },
  t5: { transform: "rotate(7deg)" },
  t6: { transform: "rotate(-1deg)" },
});

const TILTS = [
  tilts.t0,
  tilts.t1,
  tilts.t2,
  tilts.t3,
  tilts.t4,
  tilts.t5,
  tilts.t6,
] as const;

export function Cell({
  index,
  mark,
  stained = false,
  turn,
  disabled = false,
  label,
  onSelect,
}: CellProps) {
  const playable = !stained && !disabled && mark === null;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!playable}
      onClick={onSelect}
      {...stylex.props(
        styles.cell,
        styles[mark ? mark.player : turn],
        stained && styles.stain,
        playable && styles.blank,
      )}
    >
      {mark ? (
        // Mixing the index with the value keeps neighbouring cells from
        // marching through the tilts in order.
        <span {...stylex.props(TILTS[(index * 3 + mark.value) % TILTS.length])}>
          {mark.value}
        </span>
      ) : null}
    </button>
  );
}
