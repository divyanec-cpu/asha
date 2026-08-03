/**
 * Tests for the spaced revision queue.
 *
 * Three things need pinning:
 *
 *   1. Only CONCEPTUAL errors qualify. Scheduling revision for a misread would
 *      answer the wrong question, and the error-cause tag exists precisely to
 *      tell those apart.
 *   2. The Leitner arithmetic, including the date handling — due dates are
 *      calendar dates, and a timezone slip puts an evening review on the wrong
 *      day.
 *   3. The cap reports what it defers. Silent truncation reads as "that's all
 *      there is", which is the same dishonesty as an unlabelled zero.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  BOX_INTERVAL_DAYS,
  DAILY_CAP,
  MAX_BOX,
  addDays,
  demote,
  dueToday,
  promote,
  reconcileQueue,
  revisionCandidates,
  type QueueRow,
} from "./revision.ts";
import type { QuestionRow } from "./types.ts";

function qRow(over: Partial<QuestionRow> = {}): QuestionRow {
  return {
    mockId: "m1",
    sectionCode: "QA",
    typeId: "t-work",
    typeName: "Time & work",
    passageDomainId: null,
    passageDomainName: null,
    responseFormat: "mcq",
    timeSpentSec: 300,
    status: "attempted",
    isCorrect: false,
    confidence: 2,
    errorCause: "conceptual",
    marksEarned: -1,
    ...over,
  };
}

const row = (over: Partial<QueueRow & { typeName: string }> = {}) => ({
  questionTypeId: "t-work",
  typeName: "Time & work",
  box: 1,
  dueDate: "2026-08-01",
  ...over,
});

describe("revision candidates", () => {
  test("only conceptual errors qualify", () => {
    // A misread is not a knowledge gap. Nor is a careless slip, nor running out
    // of time — the whole reason error_cause is collected is to separate them.
    const rows = [
      qRow({ errorCause: "misread" }),
      qRow({ errorCause: "silly" }),
      qRow({ errorCause: "time" }),
      qRow({ errorCause: "none", isCorrect: true }),
    ];
    assert.deepEqual(revisionCandidates(rows), []);
  });

  test("counts conceptual errors per type and remembers the latest mock", () => {
    const rows = [
      qRow({ mockId: "m1" }),
      qRow({ mockId: "m2" }),
      qRow({ mockId: "m3", typeId: "t-pnc", typeName: "Permutations & combinations" }),
    ];
    const out = revisionCandidates(rows);
    assert.equal(out.length, 2);
    // Most-repeated first.
    assert.equal(out[0].typeName, "Time & work");
    assert.equal(out[0].conceptualErrors, 2);
    assert.equal(out[0].lastErrorMockId, "m2");
    assert.equal(out[1].conceptualErrors, 1);
  });

  test("untyped rows are skipped — a queue entry with no name is not actionable", () => {
    // Batch entry leaves the type null by design.
    assert.deepEqual(revisionCandidates([qRow({ typeId: null, typeName: null })]), []);
  });
});

describe("Leitner arithmetic", () => {
  test("intervals are 1-3-7-14-30 and match the schema's box constraint", () => {
    assert.deepEqual([...BOX_INTERVAL_DAYS], [1, 3, 7, 14, 30]);
    // revision_queue has `box between 1 and 5`; the list length is what pins it.
    assert.equal(MAX_BOX, 5);
  });

  test("promotion advances the box and schedules by the new interval", () => {
    const p1 = promote(row({ box: 1 }), "2026-08-01");
    assert.equal(p1.box, 2);
    assert.equal(p1.dueDate, "2026-08-04"); // +3 days

    const p2 = promote(row({ box: 4 }), "2026-08-01");
    assert.equal(p2.box, 5);
    assert.equal(p2.dueDate, "2026-08-31"); // +30 days
  });

  test("promotion stops at the top box rather than overflowing the constraint", () => {
    const top = promote(row({ box: 5 }), "2026-08-01");
    assert.equal(top.box, 5);
    assert.equal(top.dueDate, "2026-08-31");
  });

  test("demotion returns to box 1, due tomorrow", () => {
    const d = demote(row({ box: 5, dueDate: "2026-12-01" }), "2026-08-01");
    assert.equal(d.box, 1);
    assert.equal(d.dueDate, "2026-08-02");
  });

  test("date maths crosses month and year boundaries", () => {
    assert.equal(addDays("2026-08-31", 1), "2026-09-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    // 30 days from late Feb, non-leap year.
    assert.equal(addDays("2027-02-20", 30), "2027-03-22");
  });
});

describe("queue reconciliation", () => {
  test("a new concept gap inserts at box 1", () => {
    const decisions = reconcileQueue({
      candidates: revisionCandidates([qRow()]),
      existing: [],
      today: "2026-08-01",
      countedMockIds: new Set(),
    });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].action, "insert");
    if (decisions[0].action === "insert") {
      assert.equal(decisions[0].box, 1);
      assert.equal(decisions[0].dueDate, "2026-08-02");
    }
  });

  test("a gap from an uncounted mock demotes an existing topic", () => {
    const decisions = reconcileQueue({
      candidates: revisionCandidates([qRow({ mockId: "m9" })]),
      existing: [row({ box: 4, dueDate: "2026-09-01" })],
      today: "2026-08-01",
      countedMockIds: new Set(["m1"]), // m9 is new evidence
    });
    assert.equal(decisions[0].action, "demote");
    if (decisions[0].action === "demote") {
      assert.equal(decisions[0].box, 1);
      assert.equal(decisions[0].dueDate, "2026-08-02");
    }
  });

  test("an already-counted mock does NOT re-demote — or nothing could ever advance", () => {
    // Without this, every recompute would re-apply the same historical error and
    // a topic would be pinned to box 1 forever.
    const decisions = reconcileQueue({
      candidates: revisionCandidates([qRow({ mockId: "m1" })]),
      existing: [row({ box: 3, dueDate: "2026-08-20" })],
      today: "2026-08-01",
      countedMockIds: new Set(["m1"]),
    });
    assert.equal(decisions[0].action, "unchanged");
  });

  test("topics with no remaining errors are left alone, not deleted", () => {
    // A topic revised and never missed again should keep climbing its boxes,
    // which is the entire point of spaced repetition. Removal is the student's
    // call, not something that happens silently behind them.
    const decisions = reconcileQueue({
      candidates: [],
      existing: [row({ box: 3 })],
      today: "2026-08-01",
      countedMockIds: new Set(["m1"]),
    });
    assert.deepEqual(decisions, []);
  });
});

describe("what to show today", () => {
  test("includes overdue and today, excludes future", () => {
    const { due } = dueToday(
      [
        row({ questionTypeId: "a", dueDate: "2026-07-28" }),
        row({ questionTypeId: "b", dueDate: "2026-08-01" }),
        row({ questionTypeId: "c", dueDate: "2026-08-05" }),
      ],
      "2026-08-01",
    );
    assert.deepEqual(due.map((d) => d.questionTypeId), ["a", "b"]);
    assert.equal(due[0].overdueDays, 4);
    assert.equal(due[1].overdueDays, 0);
  });

  test("caps the day and REPORTS what it deferred", () => {
    const rows = Array.from({ length: DAILY_CAP + 3 }, (_, i) =>
      row({ questionTypeId: `t${i}`, dueDate: "2026-07-25" }),
    );
    const { due, deferred } = dueToday(rows, "2026-08-01");
    assert.equal(due.length, DAILY_CAP);
    // Silent truncation would read as "that's all there is".
    assert.equal(deferred, 3);
  });

  test("nothing due returns empty rather than inventing filler", () => {
    const { due, deferred } = dueToday([row({ dueDate: "2026-09-01" })], "2026-08-01");
    assert.deepEqual(due, []);
    assert.equal(deferred, 0);
  });

  test("most overdue surfaces first", () => {
    const { due } = dueToday(
      [
        row({ questionTypeId: "recent", dueDate: "2026-07-31" }),
        row({ questionTypeId: "ancient", dueDate: "2026-07-01" }),
      ],
      "2026-08-01",
    );
    assert.equal(due[0].questionTypeId, "ancient");
  });
});
