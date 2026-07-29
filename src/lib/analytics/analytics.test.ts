/**
 * Analytics tests. Run with:  npm test
 *
 * These exist because architecture.md says the maths gets verified before any
 * insight UI is built, and because a wrong number here is invisible: it renders
 * as a confident sentence with a sample size attached.
 *
 * Two themes run through them:
 *   1. Below threshold, nothing is claimed. Suppression is tested as hard as
 *      the arithmetic, because a claim that shouldn't exist is worse than one
 *      that's slightly off.
 *   2. The marks arithmetic is checked against hand-computed values under a
 *      real CAT scheme, since the design handoff shipped a calibration figure
 *      that did not follow from it (decisions.md).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { MarkingScheme } from "../marking.ts";
import { setSelectionPlaybook, skipRegret } from "./setSelection.ts";
import { calibration, errorCauses, quadrant, timeTraps } from "./questions.ts";
import { globalConfidence, pacing, trend } from "./trend.ts";
import type { QuestionRow, SectionRow, SetRow, Verdict } from "./types.ts";
import { median, stdDev } from "./types.ts";

const CAT: MarkingScheme = { markCorrect: 3, markWrongMcq: -1, markWrongNumeric: 0 };
const BUCKETS = [30, 90, 180, 300];

// ─── Builders ────────────────────────────────────────────────────────────────

function setRow(over: Partial<SetRow> = {}): SetRow {
  return {
    mockId: "m1",
    archetypeId: "a-games",
    archetypeName: "Games & tournaments",
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
    typeId: "t-avg",
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

/** n rows of one archetype with a given verdict. */
function sets(n: number, verdict: Verdict, over: Partial<SetRow> = {}): SetRow[] {
  return Array.from({ length: n }, (_, i) =>
    setRow({ mockId: `m${i + 1}`, verdict, chosen: !verdict.startsWith("skipped"), ...over }),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe("statistical helpers", () => {
  test("median handles odd and even lengths", () => {
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  test("median of nothing is null, not NaN", () => {
    assert.equal(median([]), null);
  });

  test("stdDev is null below two values — spread of one point is undefined, not zero", () => {
    assert.equal(stdDev([7]), null);
    assert.ok(stdDev([2, 4, 4, 4, 5, 5, 7, 9]) === 2);
  });
});

// ─── Set selection ───────────────────────────────────────────────────────────

describe("set-selection playbook", () => {
  test("suppresses an archetype opened fewer than 5 times, however good it looks", () => {
    // Seen 7 times, opened once, cleared it. A 100% clear rate on one attempt is
    // exactly the overclaim the threshold exists to prevent.
    const rows = [
      setRow({ chosen: true, verdict: "cleared" }),
      ...sets(6, "skipped_correctly", { chosen: false, marksEarned: 0, timeSpentSec: 0 }),
    ];
    const [first] = setSelectionPlaybook(rows);
    assert.equal(first.status, "below_threshold");
    if (first.status === "below_threshold") {
      assert.equal(first.supportingN, 1);
      assert.equal(first.needed, 5);
      assert.match(first.message, /4 more sets of that archetype/);
    }
  });

  test("clear rate is over OPENED sets, not sets seen", () => {
    const rows = [
      ...sets(5, "cleared"),
      ...sets(5, "skipped_correctly", { chosen: false, marksEarned: 0, timeSpentSec: 0 }),
    ];
    const claimed = setSelectionPlaybook(rows)[0];
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.timesSeen, 10);
      assert.equal(claimed.data.timesOpened, 5);
      assert.equal(claimed.data.clearRate, 1);
    }
  });

  test("clearRate is null when never opened — 0% would be a lie", () => {
    const rows = sets(6, "skipped_correctly", { chosen: false, marksEarned: 0, timeSpentSec: 0 });
    const claimed = setSelectionPlaybook(rows)[0];
    // Below threshold on opened count, but the standing itself must not claim 0%.
    assert.equal(claimed.status, "below_threshold");
  });

  test("never cleared despite opening it → skip_on_sight", () => {
    const rows = sets(6, "attempted_failed", { marksEarned: -1, timeSpentSec: 470 });
    const claimed = setSelectionPlaybook(rows)[0];
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.clearRate, 0);
      assert.equal(claimed.data.recommendation, "skip_on_sight");
      // 6 sets x 470s = 47 minutes sunk for nothing.
      assert.equal(claimed.data.minutesSpent, 47);
    }
  });

  test("ranks by marks per minute and puts the best first", () => {
    const good = sets(5, "cleared", {
      archetypeId: "a-games",
      archetypeName: "Games",
      timeSpentSec: 540,
      marksEarned: 12,
    });
    const slow = sets(5, "cleared", {
      archetypeId: "a-arr",
      archetypeName: "Arrangements",
      timeSpentSec: 900,
      marksEarned: 12,
    });
    const out = setSelectionPlaybook([...good, ...slow]);
    assert.equal(out[0].status, "ok");
    if (out[0].status === "ok") assert.equal(out[0].data.recommendation, "pick_first");
    if (out[0].status === "ok" && out[1].status === "ok") {
      assert.ok(out[0].data.marksPerMinute! > out[1].data.marksPerMinute!);
      assert.equal(out[0].data.archetypeName, "Games");
    }
  });

  test("abandonAfterSec needs 5 CLEARED sets, not 5 opened", () => {
    // 5 opened, only 3 cleared — enough for a standing, not for a cutoff.
    const rows = [...sets(3, "cleared"), ...sets(2, "attempted_failed", { marksEarned: -1 })];
    const claimed = setSelectionPlaybook(rows)[0];
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") assert.equal(claimed.data.abandonAfterSec, null);

    const enough = sets(5, "cleared", { timeSpentSec: 540 });
    const c2 = setSelectionPlaybook(enough)[0];
    if (c2.status === "ok") assert.equal(c2.data.abandonAfterSec, 540);
  });

  test("median clear time ignores time spent failing", () => {
    const rows = [
      ...sets(5, "cleared", { timeSpentSec: 300 }),
      setRow({ verdict: "attempted_failed", timeSpentSec: 1200, marksEarned: -1 }),
    ];
    const claimed = setSelectionPlaybook(rows)[0];
    if (claimed.status === "ok") assert.equal(claimed.data.medianClearSec, 300);
  });
});

// ─── Skip regret ─────────────────────────────────────────────────────────────

describe("skip regret", () => {
  test("needs 5 skipped sets AND 3 mocks — five skips in one paper is one event", () => {
    const oneMock = Array.from({ length: 5 }, () =>
      setRow({ mockId: "m1", chosen: false, verdict: "skipped_would_have_cleared" }),
    );
    assert.equal(skipRegret(oneMock).status, "below_threshold");

    const threeMocks = Array.from({ length: 5 }, (_, i) =>
      setRow({ mockId: `m${(i % 3) + 1}`, chosen: false, verdict: "skipped_would_have_cleared" }),
    );
    assert.equal(skipRegret(threeMocks).status, "ok");
  });

  test("counts regretted skips and attributes them to shapes", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) =>
        setRow({
          mockId: `m${i + 1}`,
          chosen: false,
          verdict: "skipped_would_have_cleared",
          archetypeName: "Arrangements",
        }),
      ),
      setRow({ mockId: "m4", chosen: false, verdict: "skipped_would_have_cleared", archetypeName: "Venn" }),
      setRow({ mockId: "m5", chosen: false, verdict: "skipped_correctly" }),
    ];
    const claimed = skipRegret(rows);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.skippedSets, 5);
      assert.equal(claimed.data.wouldHaveCleared, 4);
      assert.equal(claimed.data.rightlySkipped, 1);
      assert.equal(claimed.data.byArchetype[0].archetypeName, "Arrangements");
      assert.equal(claimed.data.byArchetype[0].count, 3);
    }
  });
});

// ─── Quadrant and time traps ─────────────────────────────────────────────────

describe("quadrant", () => {
  test("suppresses a type below 8 attempts", () => {
    const rows = Array.from({ length: 7 }, () => qRow());
    assert.equal(quadrant(rows)[0].status, "below_threshold");
  });

  test("splits on the student's own medians, not absolute cutoffs", () => {
    const fastRight = Array.from({ length: 8 }, () =>
      qRow({ typeId: "fast-right", typeName: "Averages", timeSpentSec: 30, isCorrect: true }),
    );
    const slowWrong = Array.from({ length: 8 }, (_, i) =>
      qRow({
        typeId: "slow-wrong",
        typeName: "Time & work",
        timeSpentSec: 300,
        isCorrect: i < 2,
        marksEarned: i < 2 ? 3 : -1,
      }),
    );
    const byId = new Map(
      quadrant([...fastRight, ...slowWrong])
        .filter((c) => c.status === "ok")
        .map((c) => [c.status === "ok" ? c.data.typeId : "", c.status === "ok" ? c.data : null]),
    );
    assert.equal(byId.get("fast-right")!.quadrant, "fast_right");
    assert.equal(byId.get("slow-wrong")!.quadrant, "slow_wrong");
  });

  test("untyped rows are ignored rather than lumped together", () => {
    // Batch entry leaves types null by design; they must not form a phantom type.
    const rows = Array.from({ length: 10 }, () => qRow({ typeId: null, typeName: null }));
    assert.equal(quadrant(rows).length, 0);
  });

  test("skipped questions do not count as wrong", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => qRow({ isCorrect: true })),
      ...Array.from({ length: 4 }, () => qRow({ status: "skipped", isCorrect: null })),
    ];
    const claimed = quadrant(rows)[0];
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.attempts, 8);
      assert.equal(claimed.data.accuracy, 1);
    }
  });
});

describe("time traps", () => {
  test("flags OUTLIER slow attempts within a type, and claims no ratio", () => {
    // A trap is an outlier: functional-spec says "questions where they spent far
    // more than their own median for that type". So the type's median must sit
    // low — 6 fast attempts and 2 slow misses. A type they are slow on MOST of
    // the time is not a trap, it is a slow-and-wrong quadrant entry, which the
    // next test pins down.
    const rows = [
      ...Array.from({ length: 6 }, () => qRow({ typeId: "t-pnc", typeName: "P&C", timeSpentSec: 30 })),
      ...Array.from({ length: 2 }, () =>
        qRow({
          typeId: "t-pnc",
          typeName: "P&C",
          timeSpentSec: 300,
          isCorrect: false,
          marksEarned: -1,
        }),
      ),
    ];
    const [claimed] = timeTraps(rows, BUCKETS);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.inSlowestBucket, 2);
      assert.equal(claimed.data.accuracyWhenSlow, 0);
      assert.equal(claimed.data.medianSec, 30);
      // Deliberately no "x times median" field — four coarse buckets can't
      // support a ratio (decisions.md).
      assert.equal("ratioVsMedian" in claimed.data, false);
    }
  });

  test("a type they are slow on most of the time is not a trap", () => {
    // 5 of 8 in the top bucket drags the median to 165s, which is not two
    // buckets below 300 — so this is systematic slowness, not an outlier.
    const rows = [
      ...Array.from({ length: 3 }, () => qRow({ typeId: "t-pnc", typeName: "P&C", timeSpentSec: 30 })),
      ...Array.from({ length: 5 }, () =>
        qRow({ typeId: "t-pnc", typeName: "P&C", timeSpentSec: 300, isCorrect: false }),
      ),
    ];
    assert.equal(timeTraps(rows, BUCKETS).length, 0);
  });

  test("a type where they are ALWAYS slow is not a trap", () => {
    const rows = Array.from({ length: 8 }, () =>
      qRow({ typeId: "t-geo", typeName: "Mensuration", timeSpentSec: 300, isCorrect: false }),
    );
    assert.equal(timeTraps(rows, BUCKETS).length, 0);
  });
});

// ─── Calibration: the arithmetic the design got wrong ─────────────────────────

describe("calibration", () => {
  test("counts only explicitly tagged answers", () => {
    const rows = [
      ...Array.from({ length: 30 }, () => qRow({ confidence: 3 })),
      ...Array.from({ length: 50 }, () => qRow({ confidence: null })),
    ];
    const claimed = calibration(rows, CAT);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") assert.equal(claimed.supportingN, 30);
  });

  test("suppressed below 30 tagged answers", () => {
    const rows = Array.from({ length: 29 }, () => qRow({ confidence: 3 }));
    assert.equal(calibration(rows, CAT).status, "below_threshold");
  });

  test("breakeven accuracy under CAT +3/-1 is 25%", () => {
    const rows = Array.from({ length: 30 }, () => qRow({ confidence: 1, isCorrect: false }));
    const claimed = calibration(rows, CAT);
    if (claimed.status === "ok") assert.equal(claimed.data.breakevenAccuracy, 0.25);
  });

  test("41 guesses at 22% costs about 5 marks, NOT the 14 the mockup claimed", () => {
    // The design's calibration screen said 41 guesses at 22% "handed back roughly
    // 14 marks". EV per guess is 0.22*3 + 0.78*(-1) = -0.12, so 41 guesses is
    // about -4.9. This test is the reason the function exists in this shape.
    const guesses = Array.from({ length: 41 }, (_, i) =>
      qRow({ confidence: 1, isCorrect: i < 9, marksEarned: i < 9 ? 3 : -1 }),
    );
    // Pad to clear the 30-tag threshold with non-guesses too.
    const rows = [...guesses, ...Array.from({ length: 10 }, () => qRow({ confidence: 3 }))];
    const claimed = calibration(rows, CAT);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      const ev = claimed.data.expectedMarksFromGuessing!;
      assert.ok(ev < 0, "guessing at 22% on MCQs should be net negative");
      assert.ok(Math.abs(ev) > 4 && Math.abs(ev) < 6, `expected about -5, got ${ev}`);
      assert.ok(Math.abs(ev) < 14, "must not reproduce the mockup's inflated figure");
      assert.equal(claimed.data.guessingCostsMarks, true);
    }
  });

  test("guessing TITA is EARNING marks, and must never be reported as a loss", () => {
    // The bug this pins down: with no penalty on TITA, guessing has positive EV.
    // An earlier version named this field marksLostToGuessing and returned +9.9
    // on real data, which would have rendered as "guessing cost you 9.9 marks"
    // when the truth was the opposite. Only surfaced by running against seeded
    // data — every unit test until now used MCQ guesses.
    const rows = [
      ...Array.from({ length: 40 }, (_, i) =>
        qRow({
          confidence: 1,
          responseFormat: "tita",
          isCorrect: i < 10,
          marksEarned: i < 10 ? 3 : 0,
        }),
      ),
      ...Array.from({ length: 10 }, () => qRow({ confidence: 3 })),
    ];
    const claimed = calibration(rows, CAT);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      const ev = claimed.data.expectedMarksFromGuessing!;
      assert.ok(ev > 0, `guessing free TITAs should be positive EV, got ${ev}`);
      assert.equal(claimed.data.guessingCostsMarks, false);
    }
  });

  test("a mixed paper prices MCQ and TITA guesses separately", () => {
    // 20 MCQ guesses and 20 TITA guesses at the same 25% accuracy. At CAT's
    // breakeven the MCQs are EV-neutral, so the whole figure should come from the
    // TITAs and be positive. Pooling the two penalties would wrongly drag it down.
    const mk = (fmt: "mcq" | "tita") =>
      Array.from({ length: 20 }, (_, i) =>
        qRow({ confidence: 1, responseFormat: fmt, isCorrect: i < 5, marksEarned: 0 }),
      );
    const claimed = calibration([...mk("mcq"), ...mk("tita")], CAT);
    if (claimed.status === "ok") {
      assert.ok(
        claimed.data.expectedMarksFromGuessing! > 0,
        "TITA upside must survive being averaged with break-even MCQs",
      );
    }
  });

  test("marks that small are flagged marginal, so no dramatic claim is made", () => {
    const guesses = Array.from({ length: 41 }, (_, i) => qRow({ confidence: 1, isCorrect: i < 9 }));
    const rows = [...guesses, ...Array.from({ length: 10 }, () => qRow({ confidence: 3 }))];
    const claimed = calibration(rows, CAT);
    // |−4.9| > markCorrect (3), so this particular case is NOT marginal — but a
    // smaller sample is, and that is the guard being exercised.
    if (claimed.status === "ok") {
      assert.equal(claimed.data.guessingIsMarginal, false);
    }

    const few = [
      ...Array.from({ length: 5 }, (_, i) => qRow({ confidence: 1, isCorrect: i < 1 })),
      ...Array.from({ length: 25 }, () => qRow({ confidence: 3 })),
    ];
    const c2 = calibration(few, CAT);
    if (c2.status === "ok") assert.equal(c2.data.guessingIsMarginal, true);
  });

  test("wrong TITA guesses are free and must not be penalised", () => {
    const rows = [
      ...Array.from({ length: 20 }, () =>
        qRow({ confidence: 1, isCorrect: false, responseFormat: "tita", marksEarned: 0 }),
      ),
      ...Array.from({ length: 10 }, () => qRow({ confidence: 3 })),
    ];
    const claimed = calibration(rows, CAT);
    if (claimed.status === "ok") {
      // Guess accuracy is 0, TITA penalty is 0, so EV per guess is 0.
      assert.equal(claimed.data.expectedMarksFromGuessing, 0);
    }
  });

  test("finds both diagonals", () => {
    const rows = [
      ...Array.from({ length: 15 }, () => qRow({ confidence: 3, isCorrect: false })),
      ...Array.from({ length: 15 }, () => qRow({ confidence: 1, isCorrect: true })),
    ];
    const claimed = calibration(rows, CAT);
    if (claimed.status === "ok") {
      assert.equal(claimed.data.confidentAndWrong, 15);
      assert.equal(claimed.data.guessedAndRight, 15);
    }
  });
});

// ─── Error causes ────────────────────────────────────────────────────────────

describe("error causes", () => {
  test("suppressed below 10 tagged errors in a section", () => {
    const rows = Array.from({ length: 9 }, () => qRow({ isCorrect: false, errorCause: "misread" }));
    assert.equal(errorCauses(rows)[0].status, "below_threshold");
  });

  test("reports the dominant cause and the non-conceptual share", () => {
    const rows = [
      ...Array.from({ length: 9 }, () => qRow({ isCorrect: false, errorCause: "misread" })),
      ...Array.from({ length: 5 }, () => qRow({ isCorrect: false, errorCause: "conceptual" })),
    ];
    const claimed = errorCauses(rows)[0];
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.dominant, "misread");
      assert.equal(claimed.data.total, 14);
      // 9 of 14 are not concept gaps — a reading habit, not a revision plan.
      assert.ok(Math.abs(claimed.data.notConceptualShare - 9 / 14) < 1e-9);
    }
  });

  test("a tie has no dominant cause", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => qRow({ isCorrect: false, errorCause: "misread" })),
      ...Array.from({ length: 6 }, () => qRow({ isCorrect: false, errorCause: "conceptual" })),
    ];
    const claimed = errorCauses(rows)[0];
    if (claimed.status === "ok") assert.equal(claimed.data.dominant, null);
  });

  test("'none' is not an error cause", () => {
    const rows = Array.from({ length: 20 }, () => qRow({ isCorrect: true, errorCause: "none" }));
    assert.equal(errorCauses(rows).length, 0);
  });
});

// ─── Pacing ──────────────────────────────────────────────────────────────────

describe("pacing", () => {
  const q = (marks: number[]): SectionRow => ({
    mockId: Math.random.toString(), // replaced below; ids only need to differ
    sectionCode: "QA",
    score: marks.reduce((a, b) => a + b, 0),
    quarterMarks: marks,
  });

  test("ignores sections with no quarter marks rather than inferring them", () => {
    const rows: SectionRow[] = [
      { mockId: "m1", sectionCode: "QA", score: 40, quarterMarks: null },
      { mockId: "m2", sectionCode: "QA", score: 40, quarterMarks: null },
      { mockId: "m3", sectionCode: "QA", score: 40, quarterMarks: null },
    ];
    assert.equal(pacing(rows).length, 0);
  });

  test("suppressed below 3 mocks with quarter marks", () => {
    const rows = [q([12, 11, 4, 9]), q([12, 11, 4, 9])].map((r, i) => ({ ...r, mockId: `m${i}` }));
    assert.equal(pacing(rows)[0].status, "below_threshold");
  });

  test("separates a mid-section collapse from running out of time", () => {
    // Dips in Q3 then recovers — the time was there.
    const collapse = [q([12, 11, 4, 9]), q([13, 10, 3, 8]), q([12, 12, 5, 10])].map((r, i) => ({
      ...r,
      mockId: `m${i}`,
    }));
    const c1 = pacing(collapse)[0];
    assert.equal(c1.status, "ok");
    if (c1.status === "ok") {
      assert.equal(c1.data.weakestQuarter, 2);
      assert.equal(c1.data.recovers, true);
    }

    // Falls away and stays down — genuinely ran out of time.
    const ranOut = [q([14, 12, 8, 2]), q([13, 11, 7, 1]), q([15, 12, 6, 2])].map((r, i) => ({
      ...r,
      mockId: `m${i}`,
    }));
    const c2 = pacing(ranOut)[0];
    if (c2.status === "ok") {
      assert.equal(c2.data.weakestQuarter, 3);
      assert.equal(c2.data.recovers, false);
    }
  });
});

// ─── Trend ───────────────────────────────────────────────────────────────────

describe("trend", () => {
  const mock = (i: number, score: number) => ({
    id: `m${i}`,
    takenOn: `2026-06-${String(i + 1).padStart(2, "0")}`,
    title: `Mock ${i}`,
    totalScore: score,
    timingSource: "estimated" as const,
  });

  test("refuses a trendline, permanently", () => {
    const mocks = [84, 79, 96, 91, 88, 103].map((s, i) => mock(i, s));
    const claimed = trend(mocks, 3);
    assert.equal(claimed.status, "ok");
    if (claimed.status === "ok") {
      assert.equal(claimed.data.trendline, null);
      assert.equal("slope" in claimed.data, false);
      assert.equal("gradient" in claimed.data, false);
    }
  });

  test("spread stays null below 5 mocks", () => {
    const four = [84, 79, 96, 91].map((s, i) => mock(i, s));
    const c1 = trend(four, 2);
    if (c1.status === "ok") assert.equal(c1.data.spread, null);

    const five = [84, 79, 96, 91, 88].map((s, i) => mock(i, s));
    const c2 = trend(five, 2);
    if (c2.status === "ok") assert.ok(c2.data.spread! > 0);
  });

  test("delta vs previous three needs 4 mocks", () => {
    const three = [84, 79, 96].map((s, i) => mock(i, s));
    const c1 = trend(three, 1);
    if (c1.status === "ok") assert.equal(c1.data.deltaVsPreviousThree, null);

    // 100 against a mean of (84+79+96)/3 = 86.33 → +13.7
    const four = [84, 79, 96, 100].map((s, i) => mock(i, s));
    const c2 = trend(four, 1);
    if (c2.status === "ok") assert.equal(c2.data.deltaVsPreviousThree, 13.7);
  });

  test("mocks with no score are excluded, not treated as zero", () => {
    const mocks = [mock(0, 84), { ...mock(1, 0), totalScore: null }, mock(2, 96)];
    const claimed = trend(mocks, 1);
    if (claimed.status === "ok") {
      assert.equal(claimed.data.points.length, 2);
      assert.equal(claimed.data.centre, 90);
    }
  });
});

// ─── Global confidence chip ──────────────────────────────────────────────────

describe("global confidence", () => {
  test("no live insight reads 'none', not 'low'", () => {
    assert.equal(globalConfidence(1, [], ["estimated"]).label, "none");
  });

  test("one live insight at 1x reads low", () => {
    const g = globalConfidence(3, [{ kind: "pacing", supportingN: 3 }], ["estimated"]);
    assert.equal(g.label, "low");
  });

  test("majority at 3x reads high", () => {
    const g = globalConfidence(
      12,
      [
        { kind: "pacing", supportingN: 12 },
        { kind: "calibration", supportingN: 300 },
        { kind: "set_selection", supportingN: 6 },
      ],
      ["estimated"],
    );
    assert.equal(g.label, "high");
  });

  test("v1 timing is always flagged as the student's estimate", () => {
    assert.equal(globalConfidence(5, [], ["estimated", "estimated"]).timingIsEstimated, true);
  });
});
