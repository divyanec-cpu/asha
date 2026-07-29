/**
 * Question-level analytics: the accuracy-vs-time quadrant, time traps,
 * calibration, and error causes.
 *
 * All four read `QuestionRow[]`, which exists only for VARC and QA — DILR is
 * logged at set level in v1, so the quadrant covers question-based sections
 * only. That matches the design, whose quadrant screen is headed "· QA".
 */

import type { MarkingScheme } from "../marking.ts";
import {
  type Claim,
  type ErrorCause,
  type QuestionRow,
  claim,
  mean,
  median,
  round1,
} from "./types.ts";

/** Answered questions only. Skipped rows have no accuracy and no useful time. */
const answered = (rows: QuestionRow[]) =>
  rows.filter((r) => r.status !== "skipped" && r.isCorrect !== null);

function groupByType(rows: QuestionRow[]): Map<string, QuestionRow[]> {
  const groups = new Map<string, QuestionRow[]>();
  for (const r of rows) {
    if (!r.typeId) continue; // untyped rows exist by design (batch entry)
    const list = groups.get(r.typeId);
    if (list) list.push(r);
    else groups.set(r.typeId, [r]);
  }
  return groups;
}

export type Quadrant = "fast_right" | "slow_right" | "fast_wrong" | "slow_wrong";

export type TypeStanding = {
  typeId: string;
  typeName: string;
  attempts: number;
  accuracy: number;
  /** Mean of time-bucket midpoints. Continuous despite only four buckets,
   *  because a mean over many attempts is — which is what makes the quadrant
   *  scatter meaningful rather than four vertical columns. */
  meanSec: number | null;
  quadrant: Quadrant | null;
  marksPerMinute: number | null;
};

/**
 * Places each question type on the accuracy-vs-time plane.
 *
 * The axes split at the student's OWN medians, not at absolute cutoffs. "Slow"
 * means slow for them; there is no external standard here and inventing one
 * would be a peer comparison, which rule 4 forbids.
 */
export function quadrant(rows: QuestionRow[]): Claim<TypeStanding>[] {
  const groups = groupByType(answered(rows));

  const standings: TypeStanding[] = [];
  for (const [typeId, group] of groups) {
    const times = group.map((r) => r.timeSpentSec).filter((t): t is number => t !== null);
    const correct = group.filter((r) => r.isCorrect).length;
    const marks = group.reduce((sum, r) => sum + (r.marksEarned ?? 0), 0);
    const totalSec = times.reduce((a, b) => a + b, 0);
    standings.push({
      typeId,
      typeName: group[0].typeName ?? "Unknown type",
      attempts: group.length,
      accuracy: correct / group.length,
      meanSec: mean(times),
      quadrant: null,
      marksPerMinute: totalSec === 0 ? null : round1(marks / (totalSec / 60)),
    });
  }

  // Split on the medians of the types that actually qualify, so one heavily
  // logged outlier type cannot drag the axes.
  const eligible = standings.filter((s) => s.attempts >= 8 && s.meanSec !== null);
  const accAxis = median(eligible.map((s) => s.accuracy));
  const timeAxis = median(eligible.map((s) => s.meanSec!));

  for (const s of standings) {
    if (accAxis === null || timeAxis === null || s.meanSec === null) continue;
    const isRight = s.accuracy >= accAxis;
    const isFast = s.meanSec <= timeAxis;
    s.quadrant = isRight
      ? isFast
        ? "fast_right"
        : "slow_right"
      : isFast
        ? "fast_wrong"
        : "slow_wrong";
  }

  standings.sort((a, b) => (b.marksPerMinute ?? -99) - (a.marksPerMinute ?? -99));
  return standings.map((s) => claim("quadrant", s.attempts, s));
}

export type TimeTrap = {
  typeId: string;
  typeName: string;
  attempts: number;
  /** How many attempts landed in the slowest bucket. */
  inSlowestBucket: number;
  accuracyWhenSlow: number | null;
  medianSec: number | null;
  slowestBucketSec: number;
};

/**
 * Question types where the student spends their longest bucket and still misses.
 *
 * NOTE ON PRECISION. v1 timing is four coarse buckets of the student's own
 * recall, so this deliberately does NOT claim a ratio — the design's "2.4× your
 * median" cannot be supported by four values. The claim is the weaker, true one:
 * these attempts sat in the top bucket while this type's median sits at least
 * two buckets lower.
 */
export function timeTraps(rows: QuestionRow[], bucketSeconds: number[]): Claim<TimeTrap>[] {
  const slowest = Math.max(...bucketSeconds);
  const buckets = [...bucketSeconds].sort((a, b) => a - b);
  const twoLower = buckets[Math.max(0, buckets.length - 3)];

  const groups = groupByType(answered(rows));
  const traps: TimeTrap[] = [];

  for (const [typeId, group] of groups) {
    const times = group.map((r) => r.timeSpentSec).filter((t): t is number => t !== null);
    const med = median(times);
    const slow = group.filter((r) => r.timeSpentSec === slowest);
    if (slow.length === 0) continue;
    if (med === null || med > twoLower) continue; // not a trap: they're always slow here

    const slowCorrect = slow.filter((r) => r.isCorrect).length;
    traps.push({
      typeId,
      typeName: group[0].typeName ?? "Unknown type",
      attempts: group.length,
      inSlowestBucket: slow.length,
      accuracyWhenSlow: slow.length === 0 ? null : slowCorrect / slow.length,
      medianSec: med,
      slowestBucketSec: slowest,
    });
  }

  // Worst first: most time sunk for the least return.
  traps.sort((a, b) => (a.accuracyWhenSlow ?? 1) - (b.accuracyWhenSlow ?? 1));
  return traps.map((t) => claim("time_trap", t.attempts, t));
}

export type CalibrationLevel = {
  confidence: 1 | 2 | 3;
  label: string;
  tagged: number;
  correct: number;
  accuracy: number;
};

export type Calibration = {
  levels: CalibrationLevel[];
  /** Answers tagged confidence 3 that were wrong — guessing into negative
   *  marking while feeling sure. */
  confidentAndWrong: number;
  /** Tagged confidence 1 and right — winnable marks they nearly left. */
  guessedAndRight: number;
  /**
   * SIGNED expected marks from guessing, computed from the marking scheme.
   * NEGATIVE means guessing is costing them; POSITIVE means it is earning.
   *
   * Positive is not a rounding artefact — it is the common case for a paper with
   * TITA questions, which carry no penalty, so a guess there is free upside. An
   * earlier version of this field was called `marksLostToGuessing` and returned
   * +9.9 on real data, which would have rendered as "guessing cost you 9.9
   * marks" when the truth was the exact opposite. Found by running the analytics
   * against seeded data, not by the unit tests, which only used MCQ guesses.
   */
  expectedMarksFromGuessing: number | null;
  /** True only when guessing is BOTH negative and large enough to mention. */
  guessingCostsMarks: boolean;
  /** True when the effect either way is too small to be worth a claim. */
  guessingIsMarginal: boolean;
  breakevenAccuracy: number | null;
};

const CONFIDENCE_LABELS: Record<1 | 2 | 3, string> = {
  1: "guessing",
  2: "unsure",
  3: "certain",
};

/**
 * Stated confidence against actual correctness.
 *
 * Counts ONLY explicitly tagged answers. Batch entry tags confidence on
 * exceptions alone, so `tagged` grows more slowly for a student who always
 * batches — and nothing is assumed for untagged answers, because inventing a
 * confidence value would be fabrication.
 *
 * THE MARKS ARITHMETIC IS THE POINT OF THIS FUNCTION. The design's calibration
 * screen claimed 41 guesses at 22% "handed back roughly 14 marks". Under CAT's
 * +3/−1 it is about 5, and the breakeven accuracy is 25% — so at 22% guessing is
 * barely negative and the honest finding is nearly neutral (decisions.md). Hence
 * `guessingIsMarginal`, so a caller can refuse to make a dramatic claim out of a
 * marginal number.
 */
export function calibration(
  rows: QuestionRow[],
  scheme: MarkingScheme,
  /** Below this many marks, guessing is not worth calling a problem. */
  materialityFloor = scheme.markCorrect,
): Claim<Calibration> {
  const tagged = rows.filter((r) => r.confidence !== null && r.isCorrect !== null);

  const levels: CalibrationLevel[] = ([3, 2, 1] as const)
    .map((c) => {
      const group = tagged.filter((r) => r.confidence === c);
      return {
        confidence: c,
        label: CONFIDENCE_LABELS[c],
        tagged: group.length,
        correct: group.filter((r) => r.isCorrect).length,
        accuracy: group.length === 0 ? 0 : group.filter((r) => r.isCorrect).length / group.length,
      };
    })
    .filter((l) => l.tagged > 0);

  const guesses = tagged.filter((r) => r.confidence === 1);
  const guessAccuracy =
    guesses.length === 0 ? null : guesses.filter((r) => r.isCorrect).length / guesses.length;

  // Expected value per guess, from config. A wrong MCQ costs markWrongMcq; a
  // wrong TITA costs markWrongNumeric (zero for CAT), so guessing a TITA is
  // never negative and the two must not be pooled.
  let expectedMarks: number | null = null;
  if (guessAccuracy !== null) {
    expectedMarks = guesses.reduce((sum, r) => {
      const penalty = r.responseFormat === "tita" ? scheme.markWrongNumeric : scheme.markWrongMcq;
      const ev = guessAccuracy * scheme.markCorrect + (1 - guessAccuracy) * penalty;
      return sum + ev;
    }, 0);
  }

  // Breakeven: the accuracy at which guessing an MCQ is EV-neutral.
  //   p*correct + (1-p)*wrong = 0  →  p = -wrong / (correct - wrong)
  const denom = scheme.markCorrect - scheme.markWrongMcq;
  const breakeven = denom === 0 ? null : -scheme.markWrongMcq / denom;

  return claim("calibration", tagged.length, {
    levels,
    confidentAndWrong: tagged.filter((r) => r.confidence === 3 && r.isCorrect === false).length,
    guessedAndRight: tagged.filter((r) => r.confidence === 1 && r.isCorrect === true).length,
    expectedMarksFromGuessing: expectedMarks === null ? null : round1(expectedMarks),
    guessingCostsMarks:
      expectedMarks !== null && expectedMarks < 0 && Math.abs(expectedMarks) >= materialityFloor,
    guessingIsMarginal:
      expectedMarks === null ? true : Math.abs(expectedMarks) < materialityFloor,
    breakevenAccuracy: breakeven === null ? null : round1(breakeven * 100) / 100,
  });
}

export type ErrorCauseBreakdown = {
  sectionCode: string;
  total: number;
  counts: Record<Exclude<ErrorCause, "none">, number>;
  /** The commonest cause, or null on a tie — a tie has no headline. */
  dominant: Exclude<ErrorCause, "none"> | null;
  /** Share of errors that are NOT concept gaps. This is the actionable split:
   *  misreads and slips point at reading discipline, not a revision plan. */
  notConceptualShare: number;
};

/** Error causes per section. Threshold is 10 tagged errors in that section. */
export function errorCauses(rows: QuestionRow[]): Claim<ErrorCauseBreakdown>[] {
  const bySection = new Map<string, QuestionRow[]>();
  for (const r of rows) {
    if (!r.errorCause || r.errorCause === "none") continue;
    const list = bySection.get(r.sectionCode);
    if (list) list.push(r);
    else bySection.set(r.sectionCode, [r]);
  }

  const out: Claim<ErrorCauseBreakdown>[] = [];
  for (const [sectionCode, group] of bySection) {
    const counts = { conceptual: 0, misread: 0, silly: 0, time: 0 };
    for (const r of group) {
      const cause = r.errorCause as Exclude<ErrorCause, "none">;
      counts[cause] += 1;
    }
    const entries = Object.entries(counts) as [Exclude<ErrorCause, "none">, number][];
    const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const tied = entries.filter(([, n]) => n === top[1]).length > 1;

    out.push(
      claim("error_cause", group.length, {
        sectionCode,
        total: group.length,
        counts,
        dominant: tied ? null : top[0],
        notConceptualShare: group.length === 0 ? 0 : 1 - counts.conceptual / group.length,
      }),
    );
  }
  return out;
}

export type PassageDomainStanding = {
  domainId: string;
  domainName: string;
  attempts: number;
  accuracy: number;
};

/**
 * RC accuracy by passage subject — the reason migration 0005 exists.
 *
 * Reuses the quadrant threshold: this is the same kind of claim about the same
 * kind of unit (accuracy over N attempts of a tagged category), so inventing a
 * separate number would be arbitrary.
 */
export function passageDomains(rows: QuestionRow[]): Claim<PassageDomainStanding>[] {
  const groups = new Map<string, QuestionRow[]>();
  for (const r of answered(rows)) {
    if (!r.passageDomainId) continue;
    const list = groups.get(r.passageDomainId);
    if (list) list.push(r);
    else groups.set(r.passageDomainId, [r]);
  }

  const standings = [...groups.entries()].map(([domainId, group]) => ({
    domainId,
    domainName: group[0].passageDomainName ?? "Unknown subject",
    attempts: group.length,
    accuracy: group.filter((r) => r.isCorrect).length / group.length,
  }));

  standings.sort((a, b) => a.accuracy - b.accuracy); // weakest first — that's the finding
  return standings.map((s) => claim("quadrant", s.attempts, s));
}
