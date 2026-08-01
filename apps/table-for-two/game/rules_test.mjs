import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COLOURS,
  REFLEX_DELAY_MS,
  TARGET_POINTS,
  award,
  challenge,
  judgeQuiz,
  judgeReflex,
  newMatch,
  opponent,
  quizOptions,
} from "./rules.js";

/** Deterministic stand-in for Math.random that walks a fixed list. */
function scriptedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Every challenge kind, generated across a wide spread of randomness. */
function allChallenges(kind) {
  const out = [];
  for (let i = 0; i < 200; i++) {
    const c = challenge(scriptedRandom([i / 200, (i * 7 % 200) / 200, (i * 13 % 200) / 200]));
    if (!kind || c.kind === kind) out.push(c);
  }
  return out;
}

test("opponent: the two seats face each other", () => {
  assert.equal(opponent("top"), "bottom");
  assert.equal(opponent("bottom"), "top");
});

test("challenge: every kind eventually comes up", () => {
  const kinds = new Set(allChallenges().map((c) => c.kind));
  for (const expected of ["reflex", "arithmetic", "stroop", "parity", "bigger"]) {
    assert.ok(kinds.has(expected), `never generated a ${expected} challenge`);
  }
});

test("challenge: reflex waits a beat, but not forever", () => {
  for (const c of allChallenges("reflex")) {
    assert.ok(c.delayMs >= REFLEX_DELAY_MS.min, `${c.delayMs} too short`);
    assert.ok(c.delayMs <= REFLEX_DELAY_MS.max, `${c.delayMs} too long`);
  }
});

test("challenge: arithmetic is actually correct", () => {
  for (const c of allChallenges("arithmetic")) {
    const expected = c.op === "+" ? c.a + c.b : c.a - c.b;
    assert.equal(c.answer, expected, `${c.a} ${c.op} ${c.b}`);
  }
});

test("challenge: subtraction never goes negative", () => {
  for (const c of allChallenges("arithmetic")) {
    if (c.op === "−") assert.ok(c.answer >= 0, `${c.a} − ${c.b}`);
  }
});

test("challenge: the stroop word and its ink always disagree", () => {
  const seen = allChallenges("stroop");
  assert.ok(seen.length > 0);
  for (const c of seen) {
    assert.notEqual(c.inkColour, c.wordColour);
    // The answer is the ink, not the word — that is the whole trick.
    assert.equal(c.answer, c.inkColour);
    assert.ok(COLOURS.includes(c.inkColour));
    assert.ok(COLOURS.includes(c.wordColour));
  }
});

test("challenge: parity agrees with the number shown", () => {
  for (const c of allChallenges("parity")) {
    assert.equal(c.answer, c.value % 2 === 0 ? "even" : "odd");
  }
});

test("challenge: bigger picks the larger of two different numbers", () => {
  for (const c of allChallenges("bigger")) {
    const [x, y] = c.options;
    assert.notEqual(x, y);
    assert.equal(c.answer, Math.max(x, y));
  }
});

test("quizOptions: exactly two, one right, and the wrong one is wrong", () => {
  for (const c of allChallenges()) {
    if (c.kind === "reflex") continue;
    const opts = quizOptions(c);
    assert.equal(opts.length, 2, `${c.kind} gave ${opts.length} options`);
    assert.equal(
      opts.filter((o) => o === c.answer).length,
      1,
      `${c.kind} options ${JSON.stringify(opts)} vs answer ${c.answer}`,
    );
  }
});

test("quizOptions: order is not always the same", () => {
  // Shuffled, so across many draws the answer must appear in both slots.
  const slots = new Set();
  for (let i = 0; i < 200; i++) {
    const c = challenge(scriptedRandom([0.35, i / 200, (i * 3 % 200) / 200]));
    if (c.kind === "reflex") continue;
    slots.add(quizOptions(c).indexOf(c.answer));
  }
  assert.deepEqual([...slots].sort(), [0, 1]);
});

test("judgeQuiz: a right answer scores for whoever tapped it", () => {
  const c = { kind: "parity", value: 12, answer: "even" };
  assert.deepEqual(judgeQuiz("bottom", "even", c), {
    scorer: "bottom",
    loserReason: "tooSlow",
  });
});

test("judgeQuiz: a wrong answer hands the point over", () => {
  const c = { kind: "parity", value: 12, answer: "even" };
  assert.deepEqual(judgeQuiz("bottom", "odd", c), {
    scorer: "top",
    loserReason: "wrongAnswer",
  });
});

test("judgeReflex: after the green, the tapper scores", () => {
  assert.deepEqual(judgeReflex("top", true), {
    scorer: "top",
    loserReason: "tooSlow",
  });
});

test("judgeReflex: before the green, the tapper gives it away", () => {
  assert.deepEqual(judgeReflex("top", false), {
    scorer: "bottom",
    loserReason: "jumpedEarly",
  });
});

test("newMatch: nil–nil, round one, nobody has won", () => {
  const m = newMatch();
  assert.deepEqual(m.scores, { top: 0, bottom: 0 });
  assert.equal(m.round, 1);
  assert.equal(m.winner, null);
});

test("award: a point advances the round", () => {
  const m = award(newMatch(), "top");
  assert.deepEqual(m.scores, { top: 1, bottom: 0 });
  assert.equal(m.round, 2);
  assert.equal(m.winner, null);
});

test("award: reaching the target wins and stops the round counter", () => {
  let m = newMatch();
  for (let i = 0; i < TARGET_POINTS; i++) m = award(m, "bottom");
  assert.equal(m.scores.bottom, TARGET_POINTS);
  assert.equal(m.winner, "bottom");
  assert.equal(m.round, TARGET_POINTS);
});

test("award: a decided match ignores further points", () => {
  let m = newMatch();
  for (let i = 0; i < TARGET_POINTS; i++) m = award(m, "bottom");
  assert.equal(award(m, "top"), m);
});

test("TARGET_POINTS: first to five", () => {
  assert.equal(TARGET_POINTS, 5);
});
