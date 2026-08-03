/**
 * The spaced revision queue — v2's one feature.
 *
 * WHAT THIS IS, AND WHY IT NEEDS NO EVIDENCE THRESHOLD.
 *
 * The queue is built from the student's OWN `error_cause` tags, never from
 * ASHA's inference. When they marked a question `conceptual`, they told us it was
 * a concept gap. This only remembers that and brings it back on a schedule. So a
 * topic entering the queue is a fact about what they said, not a claim about
 * their ability — the same reasoning that lets `facts.ts` bypass the thresholds.
 *
 * The distinction is load-bearing and lives in the wording:
 *
 *     "Revise Time & Work"          ← honest from one self-tagged concept error
 *     "You are weak at Time & Work" ← NOT honest from the same single error
 *
 * Nothing in this module may produce the second kind of sentence.
 *
 * Pure functions. No DB, no React. The Leitner state itself lives in
 * `revision_queue` and is reconciled by the caller.
 */

import type { QuestionRow } from "./types.ts";

/**
 * Leitner intervals in days, indexed by box 1–5.
 *
 * 1-3-7-14-30, carried over from Dhruva. The schema's `box between 1 and 5`
 * check constraint is what pins the length of this list — do not extend one
 * without the other.
 */
export const BOX_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export const MAX_BOX = BOX_INTERVAL_DAYS.length;

/**
 * How many topics to surface in one day.
 *
 * "Never show an infinite backlog" (CLAUDE.md). A student who logs a bad mock can
 * generate a dozen concept gaps at once; showing all twelve produces a list
 * nobody opens, and the queue silently becomes decoration. Overflow is deferred,
 * not dropped.
 */
export const DAILY_CAP = 5;

export type QueueRow = {
  questionTypeId: string;
  box: number;
  /** ISO date, yyyy-mm-dd. */
  dueDate: string;
};

/** What a topic needs to become, given the mocks logged so far. */
export type QueueIntent = {
  questionTypeId: string;
  typeName: string;
  /** Concept gaps the student has tagged in this type, across all mocks. */
  conceptualErrors: number;
  /** The most recent mock in which they tagged one. */
  lastErrorMockId: string;
};

/**
 * Which topics belong in the queue at all.
 *
 * Only `conceptual` errors qualify. A misread, a careless slip or running out of
 * time are not knowledge gaps, and scheduling revision for them would be
 * answering the wrong question — the error-cause tag exists precisely to tell
 * those apart, and this is the payoff for collecting it.
 *
 * Untyped rows are skipped: batch entry leaves the type null by design, and a
 * queue entry with nothing to name is not actionable.
 */
export function revisionCandidates(questions: QuestionRow[]): QueueIntent[] {
  const byType = new Map<string, QueueIntent>();

  for (const q of questions) {
    if (q.errorCause !== "conceptual") continue;
    if (!q.typeId) continue;

    const existing = byType.get(q.typeId);
    if (existing) {
      existing.conceptualErrors += 1;
      existing.lastErrorMockId = q.mockId;
    } else {
      byType.set(q.typeId, {
        questionTypeId: q.typeId,
        typeName: q.typeName ?? "Unknown type",
        conceptualErrors: 1,
        lastErrorMockId: q.mockId,
      });
    }
  }

  // Most-repeated first. Not a claim about severity — just the order in which a
  // student would most plausibly want to see them.
  return [...byType.values()].sort((a, b) => b.conceptualErrors - a.conceptualErrors);
}

export function addDays(isoDate: string, days: number): string {
  // Parsed as UTC deliberately: due dates are calendar dates, and constructing
  // them in local time makes an evening review roll over to the wrong day.
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const out = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
}

/** A topic marked revised moves up a box and is scheduled further out. */
export function promote(row: QueueRow, today: string): QueueRow {
  const box = Math.min(MAX_BOX, row.box + 1);
  return { ...row, box, dueDate: addDays(today, BOX_INTERVAL_DAYS[box - 1]) };
}

/**
 * A fresh concept gap in a topic sends it back to box 1, due tomorrow.
 *
 * This is the honest version of a Leitner failure: the evidence is a real mistake
 * on a real mock, not a self-administered quiz the student can nudge. It is also
 * why the queue does not need a quiz at all.
 */
export function demote(row: QueueRow, today: string): QueueRow {
  return { ...row, box: 1, dueDate: addDays(today, BOX_INTERVAL_DAYS[0]) };
}

export type QueueDecision =
  | { action: "insert"; questionTypeId: string; box: number; dueDate: string }
  | { action: "demote"; questionTypeId: string; box: number; dueDate: string }
  | { action: "unchanged"; questionTypeId: string };

/**
 * Reconciles the stored queue against the mocks logged so far.
 *
 * Called after an attempt is completed. Deliberately does NOT remove topics that
 * no longer have errors: a topic revised and never missed again should keep
 * climbing its boxes rather than silently vanishing, which is the whole point of
 * spaced repetition. Removal is the student's own call.
 *
 * `lastReviewedMockIds` names the mocks already accounted for, so a concept gap
 * only demotes a topic once. Without it, every recompute would re-demote on the
 * same historical error and no topic could ever advance past box 1.
 */
export function reconcileQueue({
  candidates,
  existing,
  today,
  countedMockIds,
}: {
  candidates: QueueIntent[];
  existing: QueueRow[];
  today: string;
  /** Mocks whose errors have already been applied to the queue. */
  countedMockIds: Set<string>;
}): QueueDecision[] {
  const byId = new Map(existing.map((r) => [r.questionTypeId, r]));
  const decisions: QueueDecision[] = [];

  for (const candidate of candidates) {
    const row = byId.get(candidate.questionTypeId);

    if (!row) {
      decisions.push({
        action: "insert",
        questionTypeId: candidate.questionTypeId,
        box: 1,
        dueDate: addDays(today, BOX_INTERVAL_DAYS[0]),
      });
      continue;
    }

    // A gap from a mock not yet counted is new evidence: back to box 1.
    if (!countedMockIds.has(candidate.lastErrorMockId)) {
      const next = demote(row, today);
      decisions.push({
        action: "demote",
        questionTypeId: next.questionTypeId,
        box: next.box,
        dueDate: next.dueDate,
      });
      continue;
    }

    decisions.push({ action: "unchanged", questionTypeId: candidate.questionTypeId });
  }

  return decisions;
}

export type DueTopic = {
  questionTypeId: string;
  typeName: string;
  box: number;
  dueDate: string;
  /** Days overdue; 0 when due exactly today. */
  overdueDays: number;
};

/**
 * What to show today: due topics, oldest-due first, capped.
 *
 * Returns the deferred count separately so the UI can say what it is holding
 * back. Silently truncating would read as "that's all there is", which is the
 * same class of dishonesty as an unlabelled zero.
 */
export function dueToday(
  rows: (QueueRow & { typeName: string })[],
  today: string,
  cap = DAILY_CAP,
): { due: DueTopic[]; deferred: number } {
  const dueRows = rows
    .filter((r) => r.dueDate <= today)
    .map((r) => ({
      questionTypeId: r.questionTypeId,
      typeName: r.typeName,
      box: r.box,
      dueDate: r.dueDate,
      overdueDays: daysBetween(r.dueDate, today),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays);

  return { due: dueRows.slice(0, cap), deferred: Math.max(0, dueRows.length - cap) };
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
