import * as stylex from "@stylexjs/stylex";
import type { Player } from "../../../game/rules";
import { color, font, radius } from "../../theme/tokens.stylex";

type TileProps = {
  value: number;
  player: Player;
  /** Already written on the napkin — struck through and unusable. */
  spent: boolean;
  /** Picked up, waiting for a cell. */
  chosen: boolean;
  disabled: boolean;
  label: string;
  onSelect: () => void;
};

const styles = stylex.create({
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 32,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(247, 243, 232, 0.14)",
    backgroundColor: "rgba(247, 243, 232, 0.05)",
    color: color.paper,
    fontFamily: font.written,
    fontWeight: font.weight7,
    fontSize: 26,
    cursor: "pointer",
    transitionProperty: "transform, background-color",
    transitionDuration: "120ms",
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.paper}`,
    },
    outlineOffset: 2,
  },
  spent: {
    opacity: 0.18,
    textDecoration: "line-through",
    cursor: "default",
  },
  disabled: {
    cursor: "default",
  },
  chosenBlue: {
    backgroundColor: color.blue,
    borderColor: color.blue,
    transform: "translateY(-4px)",
  },
  chosenRed: {
    backgroundColor: color.red,
    borderColor: color.red,
    transform: "translateY(-4px)",
  },
});

export function Tile({
  value,
  player,
  spent,
  chosen,
  disabled,
  label,
  onSelect,
}: TileProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={chosen}
      disabled={spent || disabled}
      onClick={onSelect}
      {...stylex.props(
        styles.tile,
        spent && styles.spent,
        disabled && styles.disabled,
        chosen && (player === "blue" ? styles.chosenBlue : styles.chosenRed),
      )}
    >
      {value}
    </button>
  );
}
