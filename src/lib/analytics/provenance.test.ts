/**
 * Tests for timing provenance.
 *
 * The rollup is four lines, which is exactly why it needs pinning: it looks like
 * something you could simplify to "measured if any section was measured", and
 * that change would silently relabel half-recalled data as stopwatch data. The
 * conservatism is the feature.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  canAggregateTiming,
  rollUpTimingSource,
  timingExplanation,
  timingLabel,
  type TimingSource,
} from "./provenance.ts";

describe("timing provenance rollup", () => {
  test("unanimous sections keep their own label", () => {
    assert.equal(rollUpTimingSource(["measured", "measured"]), "measured");
    assert.equal(rollUpTimingSource(["estimated", "estimated", "estimated"]), "estimated");
  });

  test("ANY disagreement is mixed — not 'mostly measured'", () => {
    // The tempting simplification is to call this "measured" because two of three
    // were timed. A student reading "measured" would reasonably assume all of it
    // was, which is the silent averaging the honest-data rule forbids.
    assert.equal(rollUpTimingSource(["measured", "measured", "estimated"]), "mixed");
    assert.equal(rollUpTimingSource(["estimated", "measured"]), "mixed");
  });

  test("absent sections are ignored, not counted as disagreement", () => {
    // A section with no timing at all says nothing about the provenance of the
    // sections that do have timing.
    assert.equal(rollUpTimingSource(["measured", "absent"]), "measured");
    assert.equal(rollUpTimingSource(["estimated", "absent", "absent"]), "estimated");
  });

  test("nothing but absent is absent", () => {
    assert.equal(rollUpTimingSource(["absent", "absent"]), "absent");
    assert.equal(rollUpTimingSource([]), "absent");
  });

  test("one timed section alone is measured", () => {
    // The realistic first use of timed mode: time DILR, log nothing else yet.
    assert.equal(rollUpTimingSource(["measured"]), "measured");
  });
});

describe("aggregation guard", () => {
  test("mixed timings may not be presented as one figure", () => {
    assert.equal(canAggregateTiming(["measured", "estimated"]), false);
  });

  test("unanimous timings may", () => {
    assert.equal(canAggregateTiming(["measured", "measured"]), true);
    assert.equal(canAggregateTiming(["estimated", "estimated"]), true);
    assert.equal(canAggregateTiming(["measured", "absent"]), true);
  });
});

describe("labels", () => {
  test("every provenance has a label and an explanation", () => {
    const all: ("measured" | "estimated" | "absent" | "mixed")[] = [
      "measured",
      "estimated",
      "absent",
      "mixed",
    ];
    for (const source of all) {
      assert.ok(timingLabel(source).length > 0, `${source} has no label`);
      assert.ok(timingExplanation(source).length > 20, `${source} has no explanation`);
    }
  });

  test("the measured label never claims more than it should", () => {
    // "measured" is the strong claim; it must not appear on mixed or estimated.
    assert.match(timingLabel("measured"), /MEASURED/);
    assert.match(timingLabel("estimated"), /ESTIMATES/);
    assert.doesNotMatch(timingLabel("estimated"), /^TIMING = MEASURED$/);
    // Mixed must name BOTH, so it cannot be skim-read as either one.
    assert.match(timingLabel("mixed"), /MEASURED/);
    assert.match(timingLabel("mixed"), /ESTIMATED/);
  });

  test("the mixed explanation says figures are held back, not averaged", () => {
    assert.match(timingExplanation("mixed"), /held back|rather than averaged/i);
  });
});

describe("exhaustiveness", () => {
  test("adding a TimingSource value would fail to compile, not silently fall through", () => {
    // The switch statements return on every case with no default, so a new union
    // member becomes a type error rather than an undefined label at runtime. This
    // test documents that intent; the compiler enforces it.
    const sources: TimingSource[] = ["measured", "estimated", "absent"];
    assert.equal(sources.length, 3);
  });
});
