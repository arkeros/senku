import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@panellet/i18n-runtime";
import {
  TARGET_POINTS,
  award,
  challenge,
  judgeQuiz,
  judgeReflex,
  newMatch,
  opponent,
  quizOptions,
  type Challenge,
  type Match,
  type Outcome,
  type Quiz,
  type Seat,
} from "../../game/rules";
import { Half, type Tone } from "../../ui/components/Half/Half";
import { Ticket } from "../../ui/components/Ticket/Ticket";

/** Countdown tick, and how long a decided round stays on screen. */
const TICK_MS = 600;
const RESULT_MS = 1600;
const WIN_MS = 1500;

type Stage =
  | { name: "intro" }
  | { name: "countdown"; from: number }
  | { name: "playing"; task: Challenge; green: boolean }
  | { name: "result"; outcome: Outcome }
  | { name: "over"; winner: Seat };

const styles = stylex.create({
  table: {
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
});

export function Play() {
  const { format } = useI18n();
  const [match, setMatch] = useState<Match>(newMatch);
  const [stage, setStage] = useState<Stage>({ name: "intro" });

  // Every translated string this screen can show. i18n ids must be literals
  // for the build-time coverage check, so anything keyed by an enum member is
  // written out as a map rather than looked up by concatenation.
  const names: Record<Seat, string> = {
    top: format("t2.name.mustard"),
    bottom: format("t2.name.chilli"),
  };
  const colourWord = {
    red: format("t2.colour.red"),
    blue: format("t2.colour.blue"),
    green: format("t2.colour.green"),
    yellow: format("t2.colour.yellow"),
  } as const;
  const parityWord = {
    even: format("t2.parity.even"),
    odd: format("t2.parity.odd"),
  } as const;
  const instruction = {
    reflex: format("t2.label.reflex"),
    arithmetic: format("t2.label.arithmetic"),
    stroop: format("t2.label.stroop"),
    parity: format("t2.label.parity"),
    bigger: format("t2.label.bigger"),
  } as const;
  const stampWord = {
    point: format("t2.stamp.point"),
    tooSlow: format("t2.stamp.tooSlow"),
    wrongAnswer: format("t2.stamp.wrongAnswer"),
    jumpedEarly: format("t2.stamp.jumpedEarly"),
  } as const;

  const start = useCallback(() => {
    setMatch(newMatch());
    setStage({ name: "countdown", from: 3 });
  }, []);

  // --- timers -----------------------------------------------------------
  // One effect per waiting stage, each cleaning up after itself, so an
  // interrupted round can never leave a stale timeout to fire later.
  useEffect(() => {
    if (stage.name !== "countdown") return;
    const id = setTimeout(() => {
      setStage(
        stage.from > 1
          ? { name: "countdown", from: stage.from - 1 }
          : { name: "playing", task: challenge(Math.random), green: false },
      );
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [stage]);

  useEffect(() => {
    if (stage.name !== "playing" || stage.task.kind !== "reflex" || stage.green) return;
    const id = setTimeout(
      () => setStage({ name: "playing", task: stage.task, green: true }),
      stage.task.delayMs,
    );
    return () => clearTimeout(id);
  }, [stage]);

  useEffect(() => {
    if (stage.name !== "result") return;
    // The point was already awarded when the round resolved, so read the
    // winner off `match` rather than awarding again — doing both would count
    // every point twice and end the match at three.
    const { winner } = match;
    const id = setTimeout(
      () => setStage(winner ? { name: "over", winner } : { name: "countdown", from: 3 }),
      winner ? WIN_MS : RESULT_MS,
    );
    return () => clearTimeout(id);
  }, [stage, match]);

  // --- input ------------------------------------------------------------
  const resolve = useCallback((outcome: Outcome) => {
    setMatch((m) => award(m, outcome.scorer));
    setStage({ name: "result", outcome });
  }, []);

  const tapHalf = (seat: Seat) => {
    if (stage.name !== "playing" || stage.task.kind !== "reflex") return;
    resolve(judgeReflex(seat, stage.green));
  };

  const pickOption = (seat: Seat, index: number) => {
    if (stage.name !== "playing" || stage.task.kind === "reflex") return;
    const quiz = stage.task as Quiz;
    resolve(judgeQuiz(seat, quizOptions(quiz)[index], quiz));
  };

  // --- what each half shows ---------------------------------------------
  // Two strings; not worth memoising, and computing it inline keeps it free
  // of stale-closure hazards over the label maps.
  function labelsFor(quiz: Quiz): string[] {
    return quizOptions(quiz).map((value) => {
      if (quiz.kind === "stroop") return colourWord[value as keyof typeof colourWord];
      if (quiz.kind === "parity") return parityWord[value as keyof typeof parityWord];
      return String(value);
    });
  }

  function halfProps(seat: Seat) {
    const shared = { seat, onTap: () => tapHalf(seat) };

    if (stage.name === "intro") {
      return {
        ...shared,
        tone: "idle" as Tone,
        label: format("t2.intro.side", { name: names[seat] }),
        prompt: format("t2.intro.body"),
        promptSmall: true,
      };
    }

    if (stage.name === "countdown") {
      return {
        ...shared,
        tone: "idle" as Tone,
        label: format("t2.ready"),
        prompt: String(stage.from),
      };
    }

    if (stage.name === "playing") {
      const task = stage.task;
      if (task.kind === "reflex") {
        return {
          ...shared,
          tone: (stage.green ? "go" : "armed") as Tone,
          label: stage.green ? "" : instruction.reflex,
          prompt: stage.green ? format("t2.go") : format("t2.wait"),
        };
      }
      return {
        ...shared,
        tone: "idle" as Tone,
        label: instruction[task.kind],
        prompt:
          task.kind === "arithmetic"
            ? `${task.a} ${task.op} ${task.b}`
            : task.kind === "stroop"
              ? colourWord[task.wordColour]
              : task.kind === "parity"
                ? String(task.value)
                : "▲",
        promptSmall: task.kind === "bigger",
        promptInk: task.kind === "stroop" ? task.inkColour : undefined,
        options: labelsFor(task),
        onPick: (index: number) => pickOption(seat, index),
      };
    }

    if (stage.name === "result") {
      const won = stage.outcome.scorer === seat;
      return {
        ...shared,
        tone: (won ? "won" : "lost") as Tone,
        label: won ? names[seat] : "",
        prompt: "",
        stamp: won ? stampWord.point : stampWord[stage.outcome.loserReason],
      };
    }

    const won = stage.winner === seat;
    const mine = match.scores[seat];
    const theirs = match.scores[opponent(seat)];
    return {
      ...shared,
      tone: (won ? "won" : "lost") as Tone,
      label: format("t2.bill"),
      prompt: won
        ? format("t2.win", { mine, theirs })
        : format("t2.lose", { mine, theirs }),
    };
  }

  const meta =
    stage.name === "intro"
      ? format("t2.header", { target: TARGET_POINTS })
      : stage.name === "over"
        ? format("t2.pays", { name: names[opponent(stage.winner)] })
        : format("t2.round", { n: match.round });

  const action =
    stage.name === "intro"
      ? { label: format("t2.start"), onPress: start }
      : stage.name === "over"
        ? { label: format("t2.rematch"), onPress: start }
        : null;

  return (
    <div {...stylex.props(styles.table)}>
      <Half {...halfProps("top")} />
      <Ticket scores={match.scores} target={TARGET_POINTS} meta={meta} action={action} />
      <Half {...halfProps("bottom")} />
    </div>
  );
}
