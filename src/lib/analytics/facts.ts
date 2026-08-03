/**
 * Facts about a single logged mock — findings that need no evidence threshold.
 *
 * WHY THESE ESCAPE THE THRESHOLDS, and why that is not a loophole.
 *
 * Everything in setSelection.ts / questions.ts / trend.ts makes a STATISTICAL
 * claim: it generalises from a sample to "how you tend to perform", so it needs
 * enough observations to be more than noise. Hence `Claim<T>` and the thresholds.
 *
 * The findings here are different in kind. They are either:
 *
 *   - DEDUCTIVE — true by the marking rules, not inferred from a sample. "A wrong
 *     TITA answer is not penalised, so leaving one blank was never the better
 *     choice" follows from `exam_configs`. One observation is enough because
 *     nothing is being generalised.
 *
 *   - DESCRIPTIVE — a count of what happened in one paper. data-model.md already
 *     permits these at any n: "Descriptive counts of what the student logged are
 *     always allowed at any n, because they are facts rather than claims."
 *
 * The line that must not be crossed: every string here describes THIS MOCK. None
 * says "you always", "you tend to", or "your pattern is". The moment a sentence
 * generalises it belongs in the threshold-gated modules instead.
 *
 * This exists because time-to-first-insight was the product's weakest point: a
 * student paid ten minutes to log a mock and got back a restatement of what they
 * had just typed in, with everything useful locked until mock three or five.
 *
 * Pure functions. No DB, no React.
 */

import type { MarkingScheme } from "../marking.ts";
import type { QuestionRow, SetRow } from "./types.ts";
import { round1 } from "./types.ts";

export type FactKind =
  | "blank_tita"
  | "skipped_would_have_cleared"
  | "time_sunk"
  | "confident_and_wrong";

export type Fact = {
  kind: FactKind;
  headline: string;
  detail: string;
  /**
   * Marks this fact accounts for, when it can be computed exactly from the
   * marking scheme. Null when it cannot — deliberately, rather than inventing a
   * figure. See the note on `skipped_would_have_cleared` below.
   */
  marks: number | null;
  /**
   * Sort order. Lower surfaces first, ranked by how cheap the fix is rather than
   * how bad the number looks — the same principle the home screen already uses.
   */
  priority: number;
};

export type MockFactsInput = {
  sets: SetRow[];
  questions: QuestionRow[];
  scheme: MarkingScheme;
};

/**
 * NOT INCLUDED, deliberately: the "your sets add up to X, not Y" reconciliation.
 *
 * It is already surfaced by the DILR set sheet during entry, where the paper is
 * still in front of the student and a missed set can actually be fixed. Repeating
 * it on home days later is a weaker moment to raise it, and it would mean
 * widening `SetRow` with sectionCode/numAttempted/numCorrect for one screen.
 */

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/**
 * Facts about one mock's rows. Pass ONLY the rows belonging to that mock — this
 * function does no filtering, so handing it a whole season would silently
 * produce sentences that read as being about one paper.
 */
export function mockFacts({ sets, questions, scheme }: MockFactsInput): Fact[] {
  const facts: Fact[] = [];

  // ── 1. Blank TITA answers ────────────────────────────────────────────────
  // The cheapest fix that exists, and purely deductive: if a wrong answer of this
  // format is not penalised, then not answering was never better than answering.
  // No marks figure is attached — a blind numeric guess has a poor chance of
  // landing, and quantifying the "loss" would overclaim. The point is that the
  // downside is exactly zero.
  if (scheme.markWrongNumeric >= 0) {
    const blanks = questions.filter(
      (q) => q.status === "skipped" && q.responseFormat === "tita",
    ).length;
    if (blanks > 0) {
      facts.push({
        kind: "blank_tita",
        headline: `You left ${blanks} type-in ${plural(blanks, "answer")} blank.`,
        detail:
          "Those carry no negative marking, so an attempt costs nothing. It is the one " +
          "choice on the paper where trying is never worse than not.",
        marks: null,
        priority: 1,
      });
    }
  }

  // ── 2. A set walked past that would have cleared ─────────────────────────
  // Descriptive, and the single most valuable row in the database (decisions.md).
  //
  // NO MARKS FIGURE, on purpose: "would have cleared" is the student's own
  // judgement after seeing the answers, and "cleared" does not imply every
  // question correct — so any marks number would be a guess dressed as
  // arithmetic. The count is the finding.
  const regretted = sets.filter((s) => s.verdict === "skipped_would_have_cleared");
  if (regretted.length > 0) {
    const names = [...new Set(regretted.map((s) => s.archetypeName))];
    facts.push({
      kind: "skipped_would_have_cleared",
      headline: `You walked past ${regretted.length} ${plural(regretted.length, "set")} you'd have cleared.`,
      detail:
        names.length === 1
          ? `${names[0]}. Worth a longer look next time before you move on.`
          : `${names.join(", ")}. Worth a longer look before you move on.`,
      marks: null,
      priority: 2,
    });
  }

  // ── 3. Time that returned nothing ────────────────────────────────────────
  // Descriptive, with real arithmetic. Ranked by time spent, because the fix is
  // "don't open that" and the time is what you get back.
  const sunk = sets
    .filter((s) => s.chosen && s.marksEarned <= 0 && s.timeSpentSec > 0)
    .sort((a, b) => b.timeSpentSec - a.timeSpentSec);
  if (sunk.length > 0) {
    const worst = sunk[0];
    const totalMin = Math.round(sunk.reduce((sum, s) => sum + s.timeSpentSec, 0) / 60);
    const worstMin = Math.round(worst.timeSpentSec / 60);
    facts.push({
      kind: "time_sunk",
      headline:
        sunk.length === 1
          ? `${worstMin} minutes on ${worst.archetypeName} for ${worst.marksEarned} ${plural(Math.abs(worst.marksEarned), "mark")}.`
          : `${totalMin} minutes across ${sunk.length} sets that returned nothing.`,
      detail:
        sunk.length === 1
          ? "Time is the only thing you cannot get more of in the section."
          : `The worst was ${worst.archetypeName}, at ${worstMin} minutes.`,
      marks: sunk.reduce((sum, s) => sum + s.marksEarned, 0),
      priority: 3,
    });
  }

  // ── 4. Certain and wrong ─────────────────────────────────────────────────
  // Descriptive count for this paper — NOT a calibration claim, which needs 30
  // tagged answers before it can say anything about how well-calibrated you are.
  // The marks figure is exact: these answers scored the wrong-answer penalty.
  const certainWrong = questions.filter((q) => q.confidence === 3 && q.isCorrect === false);
  if (certainWrong.length > 0) {
    const lost = certainWrong.reduce(
      (sum, q) =>
        sum + (q.responseFormat === "tita" ? scheme.markWrongNumeric : scheme.markWrongMcq),
      0,
    );
    facts.push({
      kind: "confident_and_wrong",
      headline: `${certainWrong.length} ${plural(certainWrong.length, "answer")} you felt certain about ${plural(certainWrong.length, "was", "were")} wrong.`,
      detail:
        lost === 0
          ? "No penalty on those, but worth knowing where your judgement slipped."
          : `That is ${round1(Math.abs(lost))} ${plural(Math.abs(lost), "mark")} of negative marking.`,
      marks: round1(lost),
      priority: 4,
    });
  }

  return facts.sort((a, b) => a.priority - b.priority);
}
