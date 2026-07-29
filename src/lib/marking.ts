/**
 * Marking arithmetic. Pure functions — no DB, no React (architecture.md).
 *
 * Every figure comes from a MarkingScheme read out of `exam_configs`. CLAUDE.md
 * rule 7 forbids a hardcoded constant here even when it happens to be right
 * today, because a mid-season pattern change must be a data edit.
 */

export type MarkingScheme = {
  markCorrect: number;
  markWrongMcq: number;
  markWrongNumeric: number;
};

export type SetTally = {
  /** Questions in the set as printed on the paper. */
  numQuestions: number;
  /** How many the student actually answered. */
  attempted: number;
  /** How many of those were right. */
  correct: number;
};

/**
 * Marks earned on a DILR set.
 *
 * KNOWN LIMITATION, deliberately accepted for v1: this applies MCQ negative
 * marking to every wrong answer. CAT applies no penalty to TITA questions, and
 * set-level logging cannot tell which questions in a set were TITA. So on a set
 * containing wrong TITA answers the figure is CONSERVATIVE — it under-reports.
 *
 * That is why the section-score cross-check exists and why it carries a
 * tolerance rather than demanding an exact match. Splitting the tally into
 * MCQ-wrong and TITA-wrong would fix it and would also add two more inputs per
 * set, which is the wrong trade against the sub-ten-minute logging target.
 */
export function setMarks(scheme: MarkingScheme, tally: SetTally): number {
  const wrong = Math.max(0, tally.attempted - tally.correct);
  return tally.correct * scheme.markCorrect + wrong * scheme.markWrongMcq;
}

/** Sum of marks across sets. */
export function totalSetMarks(scheme: MarkingScheme, tallies: SetTally[]): number {
  return tallies.reduce((sum, t) => sum + setMarks(scheme, t), 0);
}

export type QuestionOutcome = {
  status: "attempted" | "skipped" | "revisited";
  isCorrect: boolean | null;
  responseFormat: "mcq" | "tita";
};

/**
 * Marks for a single question.
 *
 * Unlike set-level marking, this CAN honour the TITA rule, because response
 * format is recorded per question: CAT applies no penalty to a wrong
 * type-in-the-answer question, which is why `mark_wrong_numeric` exists as a
 * separate config field. A skipped question scores nothing either way.
 */
export function questionMarks(scheme: MarkingScheme, q: QuestionOutcome): number {
  if (q.status === "skipped" || q.isCorrect === null) return 0;
  if (q.isCorrect) return scheme.markCorrect;
  return q.responseFormat === "tita" ? scheme.markWrongNumeric : scheme.markWrongMcq;
}

export function totalQuestionMarks(scheme: MarkingScheme, questions: QuestionOutcome[]): number {
  return questions.reduce((sum, q) => sum + questionMarks(scheme, q), 0);
}

/**
 * Questions left blank that carried no penalty for guessing.
 *
 * "Never leave a TITA blank" is a rule ASHA can check mechanically, and it is
 * the cheapest marks on the table — a wrong TITA costs nothing, so a blank one
 * is a free expected gain forgone. This is why response_format is worth one tap
 * during entry.
 */
export function freeSkips(questions: QuestionOutcome[]): number {
  return questions.filter((q) => q.status === "skipped" && q.responseFormat === "tita").length;
}

export type Reconciliation = {
  /** What the logged rows add up to. */
  computed: number;
  /** What the student reported from their mock platform. */
  reported: number | null;
  difference: number | null;
  /** True when the gap is large enough to be worth surfacing. */
  mismatch: boolean;
};

/**
 * Compare logged rows against the reported section score.
 *
 * The point is to catch a forgotten or mis-tagged set — the most damaging
 * data-entry error available here, because a missing set is silently invisible
 * and skipped sets are what the whole set-selection engine rests on.
 *
 * `tolerance` defaults to one correct answer's worth of marks. Anything smaller
 * is noise: TITA marking (see setMarks) and the student's own rounding both
 * produce small gaps that are not mistakes.
 */
export function reconcileSectionScore(
  scheme: MarkingScheme,
  tallies: SetTally[],
  reported: number | null,
  tolerance = scheme.markCorrect,
): Reconciliation {
  const computed = totalSetMarks(scheme, tallies);
  if (reported === null) {
    return { computed, reported: null, difference: null, mismatch: false };
  }
  const difference = computed - reported;
  return {
    computed,
    reported,
    difference,
    mismatch: Math.abs(difference) > tolerance,
  };
}

/**
 * How many of the section's questions the logged sets account for.
 *
 * The completeness rule for the set sheet: the sets are all logged when their
 * question counts sum to the section's question count. Nothing hardcodes a set
 * count, because the number of DILR sets is an exam fact that has varied and
 * belongs in data, not code.
 */
export function questionCoverage(
  tallies: Pick<SetTally, "numQuestions">[],
  sectionQuestionCount: number | null,
) {
  const accounted = tallies.reduce((sum, t) => sum + t.numQuestions, 0);
  return {
    accounted,
    expected: sectionQuestionCount,
    remaining: sectionQuestionCount === null ? null : sectionQuestionCount - accounted,
    complete: sectionQuestionCount !== null && accounted === sectionQuestionCount,
    /** Over-counting means a set was entered twice or with the wrong size. */
    over: sectionQuestionCount !== null && accounted > sectionQuestionCount,
  };
}
