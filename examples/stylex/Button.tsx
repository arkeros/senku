import * as stylex from "@stylexjs/stylex";

type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
};

const styles = stylex.create({
  base: {
    fontSize: 16,
    lineHeight: 1.5,
    borderRadius: 8,
    paddingBlock: 8,
    paddingInline: 16,
    cursor: "pointer",
    border: "none",
  },
  primary: {
    backgroundColor: "royalblue",
    color: "white",
  },
  secondary: {
    backgroundColor: "transparent",
    color: "royalblue",
    border: "1px solid royalblue",
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
