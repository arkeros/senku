import * as stylex from "@stylexjs/stylex";
import type { ColourName, Seat } from "../../../game/rules";
import { color, font, ink } from "../../theme/tokens.stylex";

/** What this half is doing, which drives its whole colour scheme. */
export type Tone = "idle" | "armed" | "go" | "won" | "lost";

type HalfProps = {
  seat: Seat;
  tone: Tone;
  /** Small caps line above the prompt. */
  label: string;
  prompt: string;
  /** Long prose (the intro) needs to be smaller than a two-digit sum. */
  promptSmall?: boolean;
  /** Stroop rounds print the word in a colour that contradicts it. */
  promptInk?: ColourName;
  /** Tappable answers, in display order. Empty for reflex rounds. */
  options?: readonly string[];
  /** Rubber stamp slapped over the half when the round resolves. */
  stamp?: string | null;
  onPick?: (index: number) => void;
  /** Reflex rounds are won by tapping anywhere on your own half. */
  onTap?: () => void;
};

const styles = stylex.create({
  half: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.boothSeat,
    transitionProperty: "background-color",
    transitionDuration: "180ms",
    fontFamily: font.mono,
  },
  // The top player reads from the far side of the table.
  upsideDown: { transform: "rotate(180deg)" },
  ringTop: { boxShadow: `inset 0 0 0 2px rgba(245, 183, 46, 0.18)` },
  ringBottom: { boxShadow: `inset 0 0 0 2px rgba(255, 77, 94, 0.18)` },
  armed: { backgroundColor: color.boothDark },
  go: { backgroundColor: color.green },
  wonTop: { backgroundColor: color.mustard },
  wonBottom: { backgroundColor: color.chilli },
  lost: { backgroundColor: color.boothDim },

  pad: {
    width: "100%",
    height: "100%",
    paddingBlock: 14,
    paddingInline: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  label: {
    fontSize: 11,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: color.muted,
    textAlign: "center",
    lineHeight: 1.4,
    minHeight: "1.4em",
  },
  prompt: {
    fontSize: "clamp(2rem, 10.5vmin, 4.2rem)",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    textAlign: "center",
    lineHeight: 1.05,
    color: color.paper,
  },
  promptSmall: {
    fontSize: "clamp(1.1rem, 4.6vmin, 1.7rem)",
    fontWeight: 700,
    letterSpacing: "0.02em",
    lineHeight: 1.3,
  },
  // On a light background the cream text would vanish.
  onLight: { color: color.booth },
  dimmed: { color: color.muted },

  options: {
    display: "flex",
    gap: 10,
    width: "100%",
    maxWidth: 460,
  },
  option: {
    flexGrow: 1,
    minHeight: "clamp(52px, 9vmin, 74px)",
    borderWidth: 2,
    borderStyle: "solid",
    borderRadius: 3,
    backgroundColor: "transparent",
    color: color.paper,
    fontFamily: font.mono,
    fontSize: "clamp(1.1rem, 5vmin, 1.6rem)",
    fontWeight: 700,
    letterSpacing: "0.04em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transform: {
      default: null,
      ":active": "translateY(1px)",
    },
    outline: {
      default: "none",
      ":focus-visible": `3px solid ${color.paper}`,
    },
    outlineOffset: 2,
  },
  optionTop: { borderColor: "rgba(245, 183, 46, 0.5)" },
  optionBottom: { borderColor: "rgba(255, 77, 94, 0.5)" },
  optionOnLight: {
    borderColor: "rgba(14, 26, 23, 0.35)",
    color: color.booth,
  },

  stamp: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  stampText: {
    borderWidth: 4,
    borderStyle: "solid",
    borderColor: "currentColor",
    borderRadius: 4,
    paddingBlock: 6,
    paddingInline: 18,
    fontSize: "clamp(1.6rem, 8vmin, 3rem)",
    fontWeight: 800,
    letterSpacing: "0.1em",
    transform: "rotate(-7deg)",
    animationName: stylex.keyframes({
      from: { transform: "rotate(-7deg) scale(1.6)", opacity: 0 },
      to: { transform: "rotate(-7deg) scale(1)", opacity: 1 },
    }),
    animationDuration: "220ms",
    animationTimingFunction: "cubic-bezier(.2, 1.6, .4, 1)",
    animationFillMode: "both",
  },
  stampLost: {
    borderWidth: 2,
    color: color.muted,
  },

  inkRed: { color: ink.red },
  inkBlue: { color: ink.blue },
  inkGreen: { color: ink.green },
  inkYellow: { color: ink.yellow },
});

const INK = {
  red: styles.inkRed,
  blue: styles.inkBlue,
  green: styles.inkGreen,
  yellow: styles.inkYellow,
} as const;

export function Half({
  seat,
  tone,
  label,
  prompt,
  promptSmall = false,
  promptInk,
  options = [],
  stamp = null,
  onPick,
  onTap,
}: HalfProps) {
  const top = seat === "top";
  // "go" and "won" paint a bright background, so the text has to flip dark.
  const light = tone === "go" || tone === "won";

  return (
    <section
      onPointerDown={onTap}
      {...stylex.props(
        styles.half,
        top && styles.upsideDown,
        tone === "idle" && (top ? styles.ringTop : styles.ringBottom),
        tone === "armed" && styles.armed,
        tone === "go" && styles.go,
        tone === "won" && (top ? styles.wonTop : styles.wonBottom),
        tone === "lost" && styles.lost,
      )}
    >
      <div {...stylex.props(styles.pad)}>
        <p {...stylex.props(styles.label, light && styles.onLight, tone === "lost" && styles.dimmed)}>
          {label}
        </p>
        <p
          {...stylex.props(
            styles.prompt,
            promptSmall && styles.promptSmall,
            light && styles.onLight,
            tone === "lost" && styles.dimmed,
            promptInk && INK[promptInk],
          )}
        >
          {prompt}
        </p>
        {options.length > 0 ? (
          <div {...stylex.props(styles.options)}>
            {options.map((text, i) => (
              <button
                key={text}
                type="button"
                // Pointer events, not click: this is a race, and click waits
                // for the release.
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPick?.(i);
                }}
                {...stylex.props(
                  styles.option,
                  top ? styles.optionTop : styles.optionBottom,
                  light && styles.optionOnLight,
                )}
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {stamp ? (
        <div {...stylex.props(styles.stamp)}>
          <span
            {...stylex.props(
              styles.stampText,
              light && styles.onLight,
              tone === "lost" && styles.stampLost,
            )}
          >
            {stamp}
          </span>
        </div>
      ) : null}
    </section>
  );
}
