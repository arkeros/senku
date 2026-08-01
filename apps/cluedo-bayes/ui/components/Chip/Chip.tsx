import * as stylex from "@stylexjs/stylex";
import { color, font } from "../../theme/tokens.stylex";

type ChipProps = {
  label: string;
  selected?: boolean;
  /** Ruled out: struck through, still tappable so a hunch can be overridden. */
  ruledOut?: boolean;
  small?: boolean;
  onPress?: () => void;
};

const styles = stylex.create({
  chip: {
    fontFamily: font.serif,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: 2,
    backgroundColor: "transparent",
    color: color.ink,
    cursor: "pointer",
    lineHeight: 1.2,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.gold}`,
    },
    outlineOffset: 1,
  },
  big: { fontSize: 12.5, paddingBlock: 5, paddingInline: 10 },
  small: { fontSize: 11, paddingBlock: 3, paddingInline: 8 },
  selected: {
    backgroundColor: color.red,
    borderColor: color.red,
    color: "#fff",
  },
  ruledOut: {
    color: color.faint,
    textDecoration: "line-through",
  },
});

export function Chip({ label, selected = false, ruledOut = false, small = false, onPress }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      {...stylex.props(
        styles.chip,
        small ? styles.small : styles.big,
        ruledOut && !selected && styles.ruledOut,
        selected && styles.selected,
      )}
    >
      {label}
    </button>
  );
}
