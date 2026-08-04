/**
 * Grading a response against an item's answer key.
 *
 * Pure, for the same reasons `lib/analytics/` is pure: it is testable without a
 * database, and the marking rules live in exactly one place instead of being
 * sprinkled through routes.
 *
 * MARKS COME FROM `exam_configs`, ALWAYS. CLAUDE.md rule 7: "Every marks figure is
 * computed from `exam_configs`, never hardcoded. A hand-written arithmetic constant
 * in analytics code is a bug even when it happens to be right today." So this
 * module takes marking as an argument and has no idea what exam it is grading —
 * +3/−1/0 for CAT, +1/−0.25 for MAT, and GMAT's 1/0/0 (which is a raw-correct
 * count, not a score — see `docs/decisions.md`).
 */

export type ResponseFormat = "mcq" | "tita";

export type GradableItem = {
  readonly responseFormat: ResponseFormat;
  /** 1-based, to match how a paper labels options. Null for TITA. */
  readonly correctOption: number | null;
  /** Null for MCQ. */
  readonly correctAnswer: string | null;
};

export type StudentResponse = {
  readonly selectedOption: number | null;
  readonly responseText: string | null;
};

export type Marking = {
  readonly markCorrect: number;
  readonly markWrongMcq: number;
  readonly markWrongNumeric: number;
};

export type Graded = {
  readonly status: "attempted" | "skipped";
  /** Null when skipped — an unanswered question is not "incorrect". */
  readonly isCorrect: boolean | null;
  readonly marksEarned: number;
};

/**
 * Did the student actually answer?
 *
 * Blank, whitespace-only and null are all "skipped". This matters more than it
 * looks: a TITA box the student tabbed through and left empty must not be graded
 * as a wrong answer, because under a negative-marking exam that would invent a
 * penalty the real paper would never apply.
 */
export function hasResponse(item: GradableItem, response: StudentResponse): boolean {
  if (item.responseFormat === "mcq") {
    return response.selectedOption !== null && response.selectedOption > 0;
  }
  return response.responseText !== null && response.responseText.trim().length > 0;
}

/**
 * Normalises a TITA answer for comparison.
 *
 * Compared as a NUMBER when both sides parse as one, so '0.5', '.5', '0.50' and
 * ' 0.5 ' are the same answer — which they are on the real paper, where TITA is
 * typed into a box. Falling back to string comparison keeps non-numeric answers
 * working, and the string compare is case- and space-insensitive.
 *
 * Deliberately NOT rounded to a fixed number of decimals: that would mark 0.333
 * and 0.334 equal, and on a question whose answer is a ratio those are different
 * answers.
 */
export function titaMatches(expected: string, given: string): boolean {
  const a = expected.trim();
  const b = given.trim();
  if (a.length === 0 || b.length === 0) return false;

  // Strip thousands separators and a leading +, both of which a student may type
  // and neither of which changes the value.
  const numeric = (s: string) => {
    const cleaned = s.replace(/,/g, "").replace(/^\+/, "");
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na === nb;

  return a.toLowerCase().replace(/\s+/g, " ") === b.toLowerCase().replace(/\s+/g, " ");
}

export function gradeResponse(
  item: GradableItem,
  response: StudentResponse,
  marking: Marking,
): Graded {
  if (!hasResponse(item, response)) {
    // No penalty and no verdict. Every exam ASHA configures gives 0 for an
    // unattempted question; if one ever does not, that belongs in `exam_configs`
    // as its own field, not as a branch here.
    return { status: "skipped", isCorrect: null, marksEarned: 0 };
  }

  const isCorrect =
    item.responseFormat === "mcq"
      ? item.correctOption !== null && response.selectedOption === item.correctOption
      : item.correctAnswer !== null &&
        titaMatches(item.correctAnswer, response.responseText ?? "");

  const wrongMark =
    item.responseFormat === "mcq" ? marking.markWrongMcq : marking.markWrongNumeric;

  return {
    status: "attempted",
    isCorrect,
    marksEarned: isCorrect ? marking.markCorrect : wrongMark,
  };
}

/**
 * Section total. Sums graded marks rather than recomputing from counts, so the
 * total can never disagree with the per-question marks stored alongside it.
 */
export function sectionTotals(graded: readonly Graded[]): {
  readonly attempted: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly skipped: number;
  readonly marks: number;
} {
  let attempted = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let marks = 0;

  for (const g of graded) {
    marks += g.marksEarned;
    if (g.status === "skipped") {
      skipped += 1;
      continue;
    }
    attempted += 1;
    if (g.isCorrect) correct += 1;
    else incorrect += 1;
  }

  // Marks are stored as numeric(4,2)/numeric(6,2); rounding to 2dp here keeps
  // float addition (0.1 + 0.2) from producing a value Postgres would round
  // differently than the sum shown on screen. Matters for MAT's −0.25 steps.
  return { attempted, correct, incorrect, skipped, marks: Math.round(marks * 100) / 100 };
}
