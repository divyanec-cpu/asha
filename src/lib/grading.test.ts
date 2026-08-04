import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gradeResponse,
  hasResponse,
  sectionTotals,
  titaMatches,
  type GradableItem,
  type Marking,
} from "./grading.ts";

// The real CAT numbers, but taken as arguments — the point of the module is that it
// does not know which exam it is grading.
const CAT: Marking = { markCorrect: 3, markWrongMcq: -1, markWrongNumeric: 0 };
const MAT: Marking = { markCorrect: 1, markWrongMcq: -0.25, markWrongNumeric: -0.25 };
// GMAT's encoding: a raw count of correct answers, no penalty. See decisions.md.
const GMAT: Marking = { markCorrect: 1, markWrongMcq: 0, markWrongNumeric: 0 };

const mcq: GradableItem = { responseFormat: "mcq", correctOption: 3, correctAnswer: null };
const tita: GradableItem = { responseFormat: "tita", correctOption: null, correctAnswer: "0.5" };

describe("hasResponse", () => {
  it("treats a blank or whitespace TITA box as unanswered", () => {
    for (const responseText of [null, "", "   ", "\t\n"]) {
      assert.equal(hasResponse(tita, { selectedOption: null, responseText }), false);
    }
  });

  it("treats no selected option as unanswered", () => {
    assert.equal(hasResponse(mcq, { selectedOption: null, responseText: null }), false);
    assert.equal(hasResponse(mcq, { selectedOption: 0, responseText: null }), false);
  });

  it("recognises a real answer", () => {
    assert.equal(hasResponse(mcq, { selectedOption: 1, responseText: null }), true);
    assert.equal(hasResponse(tita, { selectedOption: null, responseText: "12" }), true);
  });
});

describe("gradeResponse — skipped", () => {
  it("never penalises an unanswered question, even under negative marking", () => {
    // The case that matters: a MAT paper penalises wrong answers, so grading an
    // empty box as wrong would invent a deduction the real paper never applies.
    for (const marking of [CAT, MAT, GMAT]) {
      const g = gradeResponse(mcq, { selectedOption: null, responseText: null }, marking);
      assert.equal(g.status, "skipped");
      assert.equal(g.isCorrect, null);
      assert.equal(g.marksEarned, 0);
    }
  });

  it("leaves isCorrect null rather than false — unanswered is not incorrect", () => {
    const g = gradeResponse(tita, { selectedOption: null, responseText: "  " }, CAT);
    assert.equal(g.isCorrect, null);
  });
});

describe("gradeResponse — MCQ", () => {
  it("awards mark_correct for the right option", () => {
    const g = gradeResponse(mcq, { selectedOption: 3, responseText: null }, CAT);
    assert.deepEqual(g, { status: "attempted", isCorrect: true, marksEarned: 3 });
  });

  it("applies mark_wrong_mcq for the wrong option", () => {
    const g = gradeResponse(mcq, { selectedOption: 2, responseText: null }, CAT);
    assert.deepEqual(g, { status: "attempted", isCorrect: false, marksEarned: -1 });
  });

  it("uses whatever marking it is handed, with no exam knowledge of its own", () => {
    assert.equal(gradeResponse(mcq, { selectedOption: 2, responseText: null }, MAT).marksEarned, -0.25);
    assert.equal(gradeResponse(mcq, { selectedOption: 2, responseText: null }, GMAT).marksEarned, 0);
  });

  it("is 1-based, so option 1 is the first option and not the second", () => {
    const first: GradableItem = { responseFormat: "mcq", correctOption: 1, correctAnswer: null };
    assert.equal(gradeResponse(first, { selectedOption: 1, responseText: null }, CAT).isCorrect, true);
    assert.equal(gradeResponse(first, { selectedOption: 0, responseText: null }, CAT).status, "skipped");
  });
});

describe("gradeResponse — TITA", () => {
  it("has no negative marking under CAT, which is the whole reason TITA is worth guessing", () => {
    const g = gradeResponse(tita, { selectedOption: null, responseText: "9" }, CAT);
    assert.equal(g.isCorrect, false);
    assert.equal(g.marksEarned, 0);
  });

  it("uses mark_wrong_numeric, not mark_wrong_mcq", () => {
    // MAT sets both to −0.25 because it has no TITA format at all; the distinction
    // still has to be honoured rather than assumed away.
    assert.equal(gradeResponse(tita, { selectedOption: null, responseText: "9" }, MAT).marksEarned, -0.25);
  });
});

describe("titaMatches", () => {
  it("compares numerically, so equivalent typings are the same answer", () => {
    for (const given of ["0.5", ".5", "0.50", " 0.5 ", "+0.5"]) {
      assert.equal(titaMatches("0.5", given), true, `expected 0.5 to match ${JSON.stringify(given)}`);
    }
  });

  it("ignores thousands separators a student might type", () => {
    assert.equal(titaMatches("1200", "1,200"), true);
    assert.equal(titaMatches("1200", "1200"), true);
  });

  it("does NOT round — near-misses are wrong answers", () => {
    assert.equal(titaMatches("0.333", "0.334"), false);
    assert.equal(titaMatches("12", "12.5"), false);
  });

  it("handles negatives", () => {
    assert.equal(titaMatches("-4", "-4.0"), true);
    assert.equal(titaMatches("-4", "4"), false);
  });

  it("falls back to a forgiving string compare for non-numeric answers", () => {
    assert.equal(titaMatches("None", "none"), true);
    assert.equal(titaMatches("two  words", "TWO WORDS"), true);
    assert.equal(titaMatches("abc", "abd"), false);
  });

  it("never matches an empty answer", () => {
    assert.equal(titaMatches("0.5", ""), false);
    assert.equal(titaMatches("", ""), false);
    // A zero answer is a real answer and must still work.
    assert.equal(titaMatches("0", "0"), true);
  });
});

describe("sectionTotals", () => {
  it("counts and sums a mixed section", () => {
    const graded = [
      gradeResponse(mcq, { selectedOption: 3, responseText: null }, CAT), // +3
      gradeResponse(mcq, { selectedOption: 1, responseText: null }, CAT), // -1
      gradeResponse(mcq, { selectedOption: null, responseText: null }, CAT), // skipped
      gradeResponse(tita, { selectedOption: null, responseText: "0.5" }, CAT), // +3
    ];
    assert.deepEqual(sectionTotals(graded), {
      attempted: 3,
      correct: 2,
      incorrect: 1,
      skipped: 1,
      marks: 5,
    });
  });

  it("rounds to 2dp so float addition cannot disagree with the stored total", () => {
    // Four MAT wrongs: 4 × −0.25. Naive float addition gives −1.0000000000000002.
    const graded = Array.from({ length: 4 }, () =>
      gradeResponse(mcq, { selectedOption: 1, responseText: null }, MAT),
    );
    assert.equal(sectionTotals(graded).marks, -1);
  });

  it("is zero across the board for an untouched section", () => {
    assert.deepEqual(sectionTotals([]), {
      attempted: 0, correct: 0, incorrect: 0, skipped: 0, marks: 0,
    });
  });
});
