/**
 * Tests for single-mock facts.
 *
 * Two things need pinning here, and the second matters more:
 *
 *   1. The arithmetic — marks figures come from the scheme, and are absent where
 *      they cannot be derived honestly.
 *   2. THE HONESTY CONSTRAINT — nothing in this module may generalise. These
 *      findings deliberately bypass the evidence thresholds, so the guard against
 *      them becoming unearned claims is entirely in the wording. A test is the
 *      only thing that stops "you walked past a set" drifting into "you keep
 *      walking past sets" during some future copy edit.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { MarkingScheme } from "../marking.ts";
import { mockFacts } from "./facts.ts";
import type { QuestionRow, SetRow } from "./types.ts";

const CAT: MarkingScheme = { markCorrect: 3, markWrongMcq: -1, markWrongNumeric: 0 };

function setRow(over: Partial<SetRow> = {}): SetRow {
  return {
    mockId: "m1",
    archetypeId: "a1",
    archetypeName: "Scatter plot / correlation",
    chosen: true,
    selectionOrder: 1,
    timeSpentSec: 540,
    marksEarned: 12,
    numQuestions: 4,
    verdict: "cleared",
    ...over,
  };
}

function qRow(over: Partial<QuestionRow> = {}): QuestionRow {
  return {
    mockId: "m1",
    sectionCode: "QA",
    typeId: "t1",
    typeName: "Averages",
    passageDomainId: null,
    passageDomainName: null,
    responseFormat: "mcq",
    timeSpentSec: 90,
    status: "attempted",
    isCorrect: true,
    confidence: 3,
    errorCause: "none",
    marksEarned: 3,
    ...over,
  };
}

const facts = (sets: SetRow[], questions: QuestionRow[]) =>
  mockFacts({ sets, questions, scheme: CAT });

describe("single-mock facts", () => {
  test("a clean mock produces no facts rather than filler", () => {
    // Nothing went wrong, so there is nothing to say. Inventing an
    // encouragement here would be the same failure as inventing a claim.
    assert.deepEqual(facts([setRow()], [qRow()]), []);
  });

  test("blank TITA answers are reported with no marks figure attached", () => {
    const rows = [
      qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null }),
      qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null }),
    ];
    const [fact] = facts([], rows);
    assert.equal(fact.kind, "blank_tita");
    assert.match(fact.headline, /2 type-in answers blank/);
    // No marks number: a blind numeric guess has a poor chance of landing, so
    // quantifying the "loss" would overclaim. The zero downside is the finding.
    assert.equal(fact.marks, null);
  });

  test("a blank MCQ is NOT reported as free — it carries a penalty", () => {
    const rows = [qRow({ status: "skipped", isCorrect: null, responseFormat: "mcq", confidence: null })];
    assert.equal(facts([], rows).length, 0);
  });

  test("nothing is claimed about TITA when the scheme penalises it", () => {
    // An exam where wrong numeric answers DO cost marks — the deduction that
    // makes this fact valid no longer holds, so it must not be emitted.
    const penalising: MarkingScheme = { markCorrect: 3, markWrongMcq: -1, markWrongNumeric: -1 };
    const rows = [qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null })];
    assert.equal(mockFacts({ sets: [], questions: rows, scheme: penalising }).length, 0);
  });

  test("a regretted skip is named but not priced", () => {
    const rows = [
      setRow({ chosen: false, verdict: "skipped_would_have_cleared", archetypeName: "Venn diagrams", timeSpentSec: 60, marksEarned: 0 }),
    ];
    const [fact] = facts(rows, []);
    assert.equal(fact.kind, "skipped_would_have_cleared");
    assert.match(fact.headline, /walked past 1 set you'd have cleared/);
    assert.match(fact.detail, /Venn diagrams/);
    // "Would have cleared" is the student's own post-hoc judgement and does not
    // imply every question correct, so any marks figure would be invention.
    assert.equal(fact.marks, null);
  });

  test("time sunk reports the real total and the real marks", () => {
    const rows = [
      setRow({ marksEarned: -1, timeSpentSec: 720, archetypeName: "Scatter plot / correlation" }),
      setRow({ marksEarned: 0, timeSpentSec: 360, archetypeName: "Arrangements" }),
    ];
    const fact = facts(rows, []).find((f) => f.kind === "time_sunk")!;
    // 720 + 360 = 1080s = 18 minutes, and −1 + 0 marks.
    assert.match(fact.headline, /18 minutes across 2 sets/);
    assert.equal(fact.marks, -1);
    // The worst offender is named, because the fix is "don't open that one".
    assert.match(fact.detail, /Scatter plot/);
  });

  test("a set that returned nothing but cost no time is not a time fact", () => {
    const rows = [setRow({ chosen: false, verdict: "skipped_correctly", marksEarned: 0, timeSpentSec: 0 })];
    assert.equal(facts(rows, []).filter((f) => f.kind === "time_sunk").length, 0);
  });

  test("certain-and-wrong is priced from the scheme, not a constant", () => {
    const rows = [
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
    ];
    const fact = facts([], rows).find((f) => f.kind === "confident_and_wrong")!;
    assert.equal(fact.marks, -3);
    assert.match(fact.detail, /3 marks of negative marking/);
  });

  test("certain-and-wrong on TITA costs nothing, and says so", () => {
    const rows = [qRow({ confidence: 3, isCorrect: false, responseFormat: "tita", marksEarned: 0 })];
    const fact = facts([], rows).find((f) => f.kind === "confident_and_wrong")!;
    assert.equal(fact.marks, 0);
    assert.match(fact.detail, /No penalty/);
  });

  test("cheapest fix first: blank TITA outranks everything", () => {
    const sets = [
      setRow({ chosen: false, verdict: "skipped_would_have_cleared", marksEarned: 0, timeSpentSec: 60 }),
      setRow({ marksEarned: -1, timeSpentSec: 720 }),
    ];
    const questions = [
      qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null }),
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
    ];
    const kinds = facts(sets, questions).map((f) => f.kind);
    assert.deepEqual(kinds, [
      "blank_tita",
      "skipped_would_have_cleared",
      "time_sunk",
      "confident_and_wrong",
    ]);
  });

  // ── The honesty constraint ─────────────────────────────────────────────────

  test("no fact generalises beyond this one mock", () => {
    // These findings bypass the evidence thresholds, which is only defensible
    // while every sentence is about THIS paper. Words implying a tendency would
    // make them unearned statistical claims.
    const sets = [
      setRow({ chosen: false, verdict: "skipped_would_have_cleared", marksEarned: 0, timeSpentSec: 60 }),
      setRow({ marksEarned: -1, timeSpentSec: 720 }),
    ];
    const questions = [
      qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null }),
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
    ];

    const banned = [
      /\balways\b/i,
      /\bnever\b(?!\s+worse)/i, // "never worse than not" is a deduction, not a tendency
      /\busually\b/i,
      /\btend(s)? to\b/i,
      /\bevery time\b/i,
      /\byour pattern\b/i,
      /\bkeep\b/i,
      /\bhabit\b/i,
      /\btypically\b/i,
    ];

    for (const fact of facts(sets, questions)) {
      const text = `${fact.headline} ${fact.detail}`;
      for (const pattern of banned) {
        assert.ok(
          !pattern.test(text),
          `"${text}" generalises (${pattern}) — that belongs in a threshold-gated module`,
        );
      }
    }
  });

  test("singular and plural read correctly", () => {
    const one = facts([], [qRow({ status: "skipped", isCorrect: null, responseFormat: "tita", confidence: null })]);
    assert.match(one[0].headline, /1 type-in answer blank/);

    const oneWrong = facts([], [qRow({ confidence: 3, isCorrect: false, marksEarned: -1 })]);
    assert.match(oneWrong[0].headline, /1 answer you felt certain about was wrong/);

    const twoWrong = facts([], [
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
      qRow({ confidence: 3, isCorrect: false, marksEarned: -1 }),
    ]);
    assert.match(twoWrong[0].headline, /2 answers you felt certain about were wrong/);
  });
});
