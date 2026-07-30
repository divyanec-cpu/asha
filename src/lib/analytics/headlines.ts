/**
 * Plain-text headline/rationale generators for the PERSISTED insight ledger.
 *
 * These are NOT what the insight screens render. Home, playbook and trends
 * compute claims live (lib/analytics/load.ts + the pure functions) and build
 * their own copy, tuned to each screen's layout and neighbouring context — that
 * is real UI work and stays in the page components.
 *
 * This module exists only to give `insights.headline` / `insights.rationale`
 * some honest, self-contained text. The table's job in v1 is the `acted_on`
 * ledger — the v1→v2 gate metric — not a second rendering surface, so these
 * strings are simpler than the UI copy and are not required to match it word
 * for word. If a future screen ever displays `insights.headline` directly,
 * revisit whether it should share exact copy with the live screens instead of
 * this independent (but equally honest) summary.
 *
 * Pure functions, matching the rest of lib/analytics: no DB, no React.
 */

import type { ArchetypeStanding, SkipRegret } from "./setSelection";
import type { Calibration, ErrorCauseBreakdown, TimeTrap, TypeStanding } from "./questions";
import type { Pacing } from "./trend";

export function setSelectionHeadline(d: ArchetypeStanding): string {
  if (d.recommendation === "skip_on_sight") {
    return `${d.archetypeName}: opened ${d.timesOpened} times, cleared none.`;
  }
  return `${d.archetypeName}: ${Math.round((d.clearRate ?? 0) * 100)}% clear rate, ${d.marksPerMinute ?? 0} marks/min.`;
}

export function setSelectionRationale(d: ArchetypeStanding): string {
  if (d.recommendation === "skip_on_sight") {
    return `${d.minutesSpent} minutes spent for zero marks. Skip this shape on sight.`;
  }
  return `Ranked "${d.recommendation.replace(/_/g, " ")}" among your DILR set shapes.`;
}

export function skipRegretHeadline(d: SkipRegret): string {
  return `You'd have cleared ${d.wouldHaveCleared} of the ${d.skippedSets} sets you walked past.`;
}

export function skipRegretRationale(d: SkipRegret): string {
  const top = d.byArchetype[0];
  return top && top.count >= 2
    ? `${top.count} of them were ${top.archetypeName.toLowerCase()}.`
    : "No single shape stands out among the ones you regretted skipping.";
}

export function calibrationHeadline(d: Calibration): string {
  const certain = d.levels.find((l) => l.confidence === 3);
  return certain
    ? `You're right ${Math.round(certain.accuracy * 100)}% of the time when certain.`
    : "Confidence calibration is tracked.";
}

export function calibrationRationale(d: Calibration): string {
  if (d.expectedMarksFromGuessing === null) return "No tagged guesses yet.";
  if (d.guessingIsMarginal) {
    return `Guessing works out roughly neutral, about ${Math.abs(d.expectedMarksFromGuessing)} marks either way.`;
  }
  return d.guessingCostsMarks
    ? `Guessing has cost you about ${Math.abs(d.expectedMarksFromGuessing)} marks.`
    : `Guessing has earned you about ${d.expectedMarksFromGuessing} marks — the no-penalty questions make it worthwhile.`;
}

export function errorCauseHeadline(d: ErrorCauseBreakdown): string {
  return d.dominant
    ? `${d.sectionCode}: most errors are ${d.dominant}.`
    : `${d.sectionCode}: error causes are evenly split.`;
}

export function errorCauseRationale(d: ErrorCauseBreakdown): string {
  return `${Math.round(d.notConceptualShare * 100)}% of your ${d.sectionCode} errors aren't concept gaps.`;
}

export function quadrantHeadline(d: TypeStanding): string {
  const quad = d.quadrant?.replace(/_/g, " ") ?? "unclassified";
  return `${d.typeName}: ${Math.round(d.accuracy * 100)}% accuracy, ${quad}.`;
}

export function quadrantRationale(d: TypeStanding): string {
  return d.marksPerMinute !== null
    ? `${d.marksPerMinute} marks per minute over ${d.attempts} attempts.`
    : `${d.attempts} attempts logged.`;
}

export function timeTrapHeadline(d: TimeTrap): string {
  return `${d.typeName}: ${d.inSlowestBucket} of ${d.attempts} attempts ran long.`;
}

export function timeTrapRationale(d: TimeTrap): string {
  return `Right ${Math.round((d.accuracyWhenSlow ?? 0) * 100)}% of the time when it takes that long.`;
}

export function pacingHeadline(d: Pacing): string {
  return d.recovers
    ? `${d.sectionCode}: weakest in quarter ${d.weakestQuarter + 1}, but marks recover after.`
    : `${d.sectionCode}: marks taper off after quarter ${d.weakestQuarter + 1} and don't recover.`;
}

export function pacingRationale(d: Pacing): string {
  return `Quarters: ${d.meanByQuarter.join(", ")}.`;
}
