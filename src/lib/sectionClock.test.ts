import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClock, sectionClock } from "./sectionClock.ts";

/**
 * The cases that matter here are the no-limit ones. A section with no clock is
 * the path that used to fabricate a 40-minute limit, and it is unreachable
 * through the UI until MAT is activated — so it is pinned here instead.
 */

describe("sectionClock — with a sectional limit (CAT)", () => {
  const base = { timeLimitMin: 40, questionCount: 22, currentQuestion: 1 };

  it("counts down from the configured limit", () => {
    const c = sectionClock({ ...base, elapsedSec: 0 });
    assert.equal(c.mode, "countdown");
    assert.equal(c.displaySec, 2400);
    assert.equal(formatClock(c.displaySec), "40:00");
    assert.equal(c.expired, false);
  });

  it("tracks elapsed time on the progress bar, not question count", () => {
    const c = sectionClock({ ...base, elapsedSec: 1200, currentQuestion: 20 });
    assert.equal(c.progressPct, 50);
    assert.equal(formatClock(c.displaySec), "20:00");
  });

  it("goes urgent inside the last two minutes", () => {
    assert.equal(sectionClock({ ...base, elapsedSec: 2279 }).urgent, false);
    assert.equal(sectionClock({ ...base, elapsedSec: 2280 }).urgent, true);
  });

  it("expires at the limit and never shows a negative clock", () => {
    const c = sectionClock({ ...base, elapsedSec: 2500 });
    assert.equal(c.expired, true);
    assert.equal(c.displaySec, 0);
    assert.equal(c.progressPct, 100);
  });
});

describe("sectionClock — with no sectional limit (MAT)", () => {
  const base = { timeLimitMin: null, questionCount: 30, currentQuestion: 1 };

  it("counts UP instead of inventing a limit to count down from", () => {
    const c = sectionClock({ ...base, elapsedSec: 0 });
    assert.equal(c.mode, "countup");
    assert.equal(c.displaySec, 0);
    assert.equal(formatClock(c.displaySec), "00:00");
  });

  it("never expires, so the run is not cut off at a limit the exam does not set", () => {
    // Well past the 40 minutes the old `?? 40` fallback would have stopped at,
    // and past MAT's whole 120-minute allowance too.
    for (const elapsedSec of [2400, 7200, 20000]) {
      assert.equal(sectionClock({ ...base, elapsedSec }).expired, false);
    }
  });

  it("is never urgent, because there is no deadline to be urgent about", () => {
    assert.equal(sectionClock({ ...base, elapsedSec: 100000 }).urgent, false);
  });

  it("shows question progress rather than a fraction of a nonexistent limit", () => {
    assert.equal(sectionClock({ ...base, elapsedSec: 60, currentQuestion: 15 }).progressPct, 50);
    // Time has no bearing on the bar here.
    assert.equal(sectionClock({ ...base, elapsedSec: 9999, currentQuestion: 15 }).progressPct, 50);
  });

  it("handles a section whose question_count is unknown", () => {
    const c = sectionClock({ ...base, questionCount: 0, currentQuestion: 1, elapsedSec: 30 });
    assert.equal(c.progressPct, 0);
    assert.equal(c.displaySec, 30);
  });
});

describe("formatClock", () => {
  it("pads to mm:ss", () => {
    assert.equal(formatClock(0), "00:00");
    assert.equal(formatClock(9), "00:09");
    assert.equal(formatClock(65), "01:05");
  });

  it("keeps counting past an hour rather than wrapping", () => {
    // A count-up run has no upper bound, so this is reachable.
    assert.equal(formatClock(3600), "60:00");
    assert.equal(formatClock(7265), "121:05");
  });

  it("never renders a negative clock", () => {
    assert.equal(formatClock(-5), "00:00");
  });
});
