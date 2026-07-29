/**
 * Input shapes for the analytics layer.
 *
 * These are PLAIN OBJECTS, deliberately decoupled from the database rows. The
 * one architectural rule that matters (architecture.md): everything in
 * lib/analytics takes plain arrays in and returns plain objects out — no
 * Supabase client, no React, no side effects. That is what makes the maths
 * testable without a database, which is the only way it gets verified.
 */

import type { ConfidenceLabel, InsightKind } from "../thresholds.ts";
import { MIN_INSTANCES, confidenceLabel, meetsThreshold, shortfallMessage } from "../thresholds.ts";

export type Verdict =
  | "cleared"
  | "attempted_failed"
  | "abandoned_midway"
  | "skipped_would_have_cleared"
  | "skipped_correctly";

export type ErrorCause = "conceptual" | "misread" | "silly" | "time" | "none";

export type MockRow = {
  id: string;
  takenOn: string;
  title: string;
  totalScore: number | null;
  timingSource: "measured" | "estimated" | "absent";
};

export type SectionRow = {
  mockId: string;
  sectionCode: string;
  score: number | null;
  /** [q1,q2,q3,q4] marks. Null when the student didn't supply it — pacing is
   *  gated on presence, never inferred. */
  quarterMarks: number[] | null;
};

export type SetRow = {
  mockId: string;
  archetypeId: string | null;
  archetypeName: string;
  chosen: boolean;
  selectionOrder: number | null;
  timeSpentSec: number;
  marksEarned: number;
  numQuestions: number;
  verdict: Verdict | null;
};

export type QuestionRow = {
  mockId: string;
  sectionCode: string;
  typeId: string | null;
  typeName: string | null;
  passageDomainId: string | null;
  passageDomainName: string | null;
  responseFormat: "mcq" | "tita";
  timeSpentSec: number | null;
  status: "attempted" | "skipped" | "revisited";
  isCorrect: boolean | null;
  confidence: number | null;
  errorCause: ErrorCause | null;
  marksEarned: number | null;
};

/**
 * Every analytic returns one of these. The shape is the honest-data rule made
 * structural: there is no way to hand back a claim without its evidence base,
 * and a below-threshold result carries the shortfall message instead of a
 * number — so a caller physically cannot render a claim that shouldn't exist.
 */
export type Claim<T> =
  | {
      status: "ok";
      data: T;
      supportingN: number;
      confidence: ConfidenceLabel;
    }
  | {
      status: "below_threshold";
      supportingN: number;
      needed: number;
      message: string;
    };

/** Build a Claim, applying the threshold for its kind. */
export function claim<T>(
  kind: InsightKind,
  supportingN: number,
  data: T,
  mockCount?: number,
): Claim<T> {
  if (!meetsThreshold(kind, supportingN, mockCount)) {
    return {
      status: "below_threshold",
      supportingN,
      needed: MIN_INSTANCES[kind],
      message: shortfallMessage(kind, supportingN) ?? "Not enough data yet.",
    };
  }
  // confidenceLabel cannot be null here — meetsThreshold just passed — but the
  // fallback keeps this total rather than relying on that reasoning holding
  // after a future edit.
  return {
    status: "ok",
    data,
    supportingN,
    confidence: confidenceLabel(kind, supportingN) ?? "low",
  };
}

/** Median of a numeric list. Returns null for an empty list rather than NaN. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation. Null below two values, where spread is
 *  undefined rather than zero. */
export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Round to one decimal place, for display-facing figures. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
