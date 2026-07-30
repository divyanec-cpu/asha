/**
 * The set-selection playbook and skip regret — the signature analytics.
 *
 * The premise (decisions.md): the whole DILR problem is SELECTION. With five
 * sets and time for three, marks come from picking correctly rather than from
 * solving faster. So the useful question is not "how good am I at DILR" but
 * "which shapes are actually worth my forty minutes".
 */

import { meetsThreshold } from "../thresholds.ts";
import {
  type Claim,
  type SetRow,
  claim,
  median,
  round1,
} from "./types.ts";

export type Recommendation =
  | "pick_first"
  | "pick_second"
  | "only_if_third"
  | "hold"
  | "skip_on_sight";

export type ArchetypeStanding = {
  archetypeId: string | null;
  archetypeName: string;
  /** Every time this shape appeared on a paper, opened or not. */
  timesSeen: number;
  /** Times the student actually opened it. */
  timesOpened: number;
  timesCleared: number;
  /** cleared / opened. Null when never opened — a rate over zero attempts is
   *  meaningless, and 0% would be a lie. */
  clearRate: number | null;
  /** Median seconds to clear, over CLEARED sets only. Time spent failing tells
   *  you what a failure costs, not what success takes. */
  medianClearSec: number | null;
  /** Total minutes spent on this shape, including failures and abandonments —
   *  that time was spent whether or not marks followed. */
  minutesSpent: number;
  marksEarned: number;
  /** marks per minute, over opened sets. The ranking metric. */
  marksPerMinute: number | null;
  recommendation: Recommendation;
  /**
   * "Abandon after N seconds" — the student's own median time-to-clear. Only set
   * once there are 5 CLEARED sets of the shape; below that there is no honest
   * basis for a prescriptive cutoff, and the design's "abandon at six minutes"
   * had no derivation at all (decisions.md).
   */
  abandonAfterSec: number | null;
};

/**
 * Ranks archetypes by what they are worth to THIS student.
 *
 * supportingN is the number of times the shape was OPENED, not seen. A clear
 * rate, a time-to-clear and a marks-per-minute all require attempts; counting
 * appearances would let a shape opened once claim a 100% clear rate on n=7.
 *
 * Returns one Claim per archetype, so the caller renders a locked card for the
 * ones below threshold instead of silently dropping them — the scarcity is the
 * honesty argument made visible.
 */
export function setSelectionPlaybook(sets: SetRow[]): Claim<ArchetypeStanding>[] {
  const groups = new Map<string, SetRow[]>();
  for (const s of sets) {
    const key = s.archetypeId ?? `name:${s.archetypeName}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }

  const standings: ArchetypeStanding[] = [];

  for (const rows of groups.values()) {
    const opened = rows.filter((r) => r.chosen);
    const cleared = rows.filter((r) => r.verdict === "cleared");
    const totalSec = opened.reduce((sum, r) => sum + r.timeSpentSec, 0);
    const marks = opened.reduce((sum, r) => sum + r.marksEarned, 0);
    const clearTimes = cleared.map((r) => r.timeSpentSec);
    const medianClear = median(clearTimes);

    standings.push({
      archetypeId: rows[0].archetypeId,
      archetypeName: rows[0].archetypeName,
      timesSeen: rows.length,
      timesOpened: opened.length,
      timesCleared: cleared.length,
      clearRate: opened.length === 0 ? null : cleared.length / opened.length,
      medianClearSec: medianClear,
      minutesSpent: round1(totalSec / 60),
      marksEarned: marks,
      marksPerMinute: totalSec === 0 ? null : round1(marks / (totalSec / 60)),
      recommendation: "hold",
      // 5 cleared sets, not 5 opened: a cutoff derived from two successes is
      // noise dressed as advice.
      abandonAfterSec: cleared.length >= 5 ? medianClear : null,
    });
  }

  // Ranking rule, written down because a recommendation with no traceable basis
  // is exactly what the derived-measures rule forbids:
  //   never cleared despite being opened  → skip_on_sight
  //   otherwise rank by marks per minute  → 1st, 2nd, then only_if_third
  //   no attempts at all                  → hold
  //
  // ONLY shapes that clear the evidence threshold are ranked. Ranking everything
  // and filtering afterwards produced a visible bug: a shape opened once at a
  // 100% clear rate took the pick_first slot, was then hidden as below-threshold,
  // and the playbook's top visible row read "PICK SECOND" with no first. Beyond
  // looking broken, advising "pick this first" on evidence too thin to show is
  // exactly the overclaim the thresholds exist to prevent.
  const ranked = standings
    .filter(
      (s) =>
        s.timesOpened > 0 &&
        (s.clearRate ?? 0) > 0 &&
        meetsThreshold("set_selection", s.timesOpened),
    )
    .sort((a, b) => (b.marksPerMinute ?? 0) - (a.marksPerMinute ?? 0));

  ranked.forEach((s, i) => {
    s.recommendation = i === 0 ? "pick_first" : i === 1 ? "pick_second" : "only_if_third";
  });
  for (const s of standings) {
    if (
      s.timesOpened > 0 &&
      (s.clearRate ?? 0) === 0 &&
      meetsThreshold("set_selection", s.timesOpened)
    ) {
      s.recommendation = "skip_on_sight";
    }
  }

  // Best first, but a shape that eats time for nothing sorts to the bottom so the
  // playbook reads as a pick order.
  standings.sort((a, b) => {
    const rank = (r: Recommendation) =>
      ({ pick_first: 0, pick_second: 1, only_if_third: 2, hold: 3, skip_on_sight: 4 })[r];
    const byRank = rank(a.recommendation) - rank(b.recommendation);
    return byRank !== 0 ? byRank : (b.marksPerMinute ?? -99) - (a.marksPerMinute ?? -99);
  });

  return standings.map((s) => claim("set_selection", s.timesOpened, s));
}

export type SkipRegret = {
  skippedSets: number;
  wouldHaveCleared: number;
  rightlySkipped: number;
  /** Of the sets walked past, how many would have been cleared. */
  regretRate: number;
  /** Which shapes the regretted skips were, commonest first — this is the
   *  actionable part: "three of the four were arrangements". */
  byArchetype: { archetypeName: string; count: number }[];
  mocksCovered: number;
};

/**
 * How much the student's scanning is costing them.
 *
 * Threshold is 5 skipped sets across at least 3 mocks. The mock count matters
 * independently: five skips inside one bad paper is one event, not a pattern,
 * which is why thresholds.ts carries MIN_MOCKS for this kind alone.
 */
export function skipRegret(sets: SetRow[]): Claim<SkipRegret> {
  const skipped = sets.filter((s) => !s.chosen);
  const regretted = skipped.filter((s) => s.verdict === "skipped_would_have_cleared");
  const mocksCovered = new Set(skipped.map((s) => s.mockId)).size;

  const counts = new Map<string, number>();
  for (const s of regretted) {
    counts.set(s.archetypeName, (counts.get(s.archetypeName) ?? 0) + 1);
  }

  return claim(
    "skip_regret",
    skipped.length,
    {
      skippedSets: skipped.length,
      wouldHaveCleared: regretted.length,
      rightlySkipped: skipped.filter((s) => s.verdict === "skipped_correctly").length,
      regretRate: skipped.length === 0 ? 0 : regretted.length / skipped.length,
      byArchetype: [...counts.entries()]
        .map(([archetypeName, count]) => ({ archetypeName, count }))
        .sort((a, b) => b.count - a.count),
      mocksCovered,
    },
    mocksCovered,
  );
}
