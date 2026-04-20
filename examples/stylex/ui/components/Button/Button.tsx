import * as stylex from "@stylexjs/stylex";
import { color, font, radius, shadow, size } from "../../theme/tokens.stylex";

type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
};

const styles = stylex.create({
  base: {
    fontSize: font.size2,
    lineHeight: font.lineHeight3,
    fontWeight: font.weight5,
    borderRadius: radius.sm,
    paddingBlock: size.xs,
    paddingInline: size.s,
    cursor: "pointer",
    border: "none",
    boxShadow: shadow.sm,
  },
  primary: {
    backgroundColor: color.primary,
    color: color.white,
  },
  secondary: {
    backgroundColor: color.transparent,
    color: color.primary,
    border: `1px solid ${color.primaryLight}`,
    boxShadow: "none",
  },
});

export function Button({ label, variant = "primary", onClick }: ButtonProps) {
  return (
    <button
      {...stylex.props(styles.base, styles[variant])}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
