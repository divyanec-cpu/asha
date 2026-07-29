/**
 * Cross-mock analytics: pacing, the score trend, and the global confidence chip.
 */

import { type Claim, type MockRow, type SectionRow, claim, mean, round1, stdDev } from "./types.ts";
import { MIN_INSTANCES, type InsightKind } from "../thresholds.ts";

export type Pacing = {
  sectionCode: string;
  mocks: number;
  /** Mean marks earned in each quarter of the section clock. */
  meanByQuarter: number[];
  /** Index (0-3) of the weakest quarter. */
  weakestQuarter: number;
  /**
   * True when marks recover after the weakest quarter. This distinguishes the
   * two failure modes the whole measure exists to separate: running out of time
   * (marks fall and stay down) versus collapsing mid-section (marks dip and
   * recover, which means the time was there).
   */
  recovers: boolean;
};

/**
 * Marks per quarter, per section.
 *
 * Reads `quarterMarks` and NEVER infers it. No v1 entry flow captures attempt
 * order, so there is no honest way to derive which quarter a mark landed in —
 * sections without it are simply excluded, and the threshold counts only mocks
 * that have it (data-model.md).
 */
export function pacing(sections: SectionRow[]): Claim<Pacing>[] {
  const bySection = new Map<string, SectionRow[]>();
  for (const s of sections) {
    if (!s.quarterMarks || s.quarterMarks.length !== 4) continue;
    const list = bySection.get(s.sectionCode);
    if (list) list.push(s);
    else bySection.set(s.sectionCode, [s]);
  }

  const out: Claim<Pacing>[] = [];
  for (const [sectionCode, rows] of bySection) {
    const meanByQuarter = [0, 1, 2, 3].map(
      (q) => round1(mean(rows.map((r) => r.quarterMarks![q])) ?? 0),
    );
    let weakest = 0;
    for (let q = 1; q < 4; q++) {
      if (meanByQuarter[q] < meanByQuarter[weakest]) weakest = q;
    }
    const after = meanByQuarter.slice(weakest + 1);
    const recovers = after.length > 0 && Math.max(...after) > meanByQuarter[weakest];

    out.push(
      claim("pacing", rows.length, {
        sectionCode,
        mocks: rows.length,
        meanByQuarter,
        weakestQuarter: weakest,
        recovers,
      }),
    );
  }
  return out;
}

export type TrendPoint = { mockId: string; takenOn: string; title: string; score: number };

export type Trend = {
  points: TrendPoint[];
  /** Mean score, the centre of the honest band. */
  centre: number;
  /** ±1 standard deviation. Null below 2 points, where spread is undefined. */
  spread: number | null;
  /**
   * Latest score minus the mean of the three before it. Null below 4 mocks —
   * "+14 vs your last three" needs three priors to compare against.
   */
  deltaVsPreviousThree: number | null;
  /**
   * DELIBERATELY ABSENT: any slope, gradient or trendline.
   *
   * Scores across different mock providers are not a comparable series — a
   * SimCAT and an AIMCAT are differently scaled — so a line through them would
   * imply a precision the data cannot carry. The band is what the data supports
   * (design 1j says so on screen). This field exists to document the refusal so
   * nobody adds one later thinking it was an oversight.
   */
  readonly trendline: null;
  providers: number;
};

export function trend(mocks: MockRow[], providersCount: number): Claim<Trend> {
  const points = mocks
    .filter((m) => m.totalScore !== null)
    .map((m) => ({
      mockId: m.id,
      takenOn: m.takenOn,
      title: m.title,
      score: m.totalScore!,
    }))
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn));

  const scores = points.map((p) => p.score);
  const sd = stdDev(scores);

  let delta: number | null = null;
  if (points.length >= 4) {
    const prior = scores.slice(-4, -1);
    const priorMean = mean(prior);
    if (priorMean !== null) delta = round1(scores[scores.length - 1] - priorMean);
  }

  // Reuses the pacing threshold: both are "how many mocks before this is worth
  // saying", and a second number would be arbitrary. The band itself needs 5
  // (data-model.md), enforced by spread staying null below that.
  return claim("pacing", points.length, {
    points,
    centre: round1(mean(scores) ?? 0),
    spread: points.length >= 5 && sd !== null ? round1(sd) : null,
    deltaVsPreviousThree: delta,
    trendline: null,
    providers: providersCount,
  });
}

export type GlobalConfidence = {
  mocks: number;
  liveKinds: number;
  label: "none" | "low" | "medium" | "high";
  /** Every attempt in v1 is the student's recall, so this is always true for
   *  now. Surfaced so the header can say "TIMING = YOUR ESTIMATES". */
  timingIsEstimated: boolean;
};

/**
 * The header chip on home ("12 MOCKS · HIGH CONFIDENCE · TIMING = YOUR
 * ESTIMATES"). The design shows this without defining it, so the rule is:
 *
 *   no live insight                        → none
 *   any live                               → low
 *   majority of live kinds at ≥2×          → medium
 *   majority at ≥3×                        → high
 *
 * Global confidence lives in the header so individual cards stay clean, which is
 * the design's own stated reason for it.
 */
export function globalConfidence(
  mockCount: number,
  /** supportingN per live insight kind. */
  live: { kind: InsightKind; supportingN: number }[],
  timingSources: ("measured" | "estimated" | "absent")[],
): GlobalConfidence {
  const multiples = live.map((l) => l.supportingN / MIN_INSTANCES[l.kind]);
  const atLeast = (m: number) => multiples.filter((x) => x >= m).length;
  const majority = Math.ceil(multiples.length / 2);

  let label: GlobalConfidence["label"] = "none";
  if (multiples.length > 0) {
    label = "low";
    if (atLeast(2) >= majority) label = "medium";
    if (atLeast(3) >= majority) label = "high";
  }

  return {
    mocks: mockCount,
    liveKinds: multiples.length,
    label,
    timingIsEstimated: timingSources.some((t) => t === "estimated"),
  };
}
