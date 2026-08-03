/**
 * Timing provenance — which timings were measured, which were recalled, and what
 * an attempt made of both is allowed to call itself.
 *
 * This is the honest-data rule expressed as code. CLAUDE.md: "Never average
 * measured and estimated timings into one figure without saying so." Timed mode
 * (v3) makes `measured` real, and a student will realistically time one section
 * and log the others from memory — so an attempt can genuinely be part one and
 * part the other, and the app has to be able to say so.
 *
 * Pure functions. No DB, no React.
 */

export type TimingSource = "measured" | "estimated" | "absent";

/** What an attempt may claim, once its sections disagree. */
export type AttemptTimingSource = TimingSource | "mixed";

/**
 * Rolls section provenances up to the attempt.
 *
 * Deliberately conservative: anything other than unanimity is `mixed`. The
 * temptation is to call an attempt "measured" when most of it was timed, which is
 * exactly the silent averaging the rule forbids — a student reading "measured"
 * would reasonably assume all of it was.
 *
 * `absent` sections are ignored rather than treated as disagreement: a section
 * with no timing data at all says nothing about the provenance of the sections
 * that do have it. An attempt of only absent sections is `absent`.
 */
export function rollUpTimingSource(sections: TimingSource[]): AttemptTimingSource {
  const withTiming = sections.filter((s) => s !== "absent");
  if (withTiming.length === 0) return "absent";

  const distinct = new Set(withTiming);
  if (distinct.size === 1) return withTiming[0];
  return "mixed";
}

/**
 * Whether a timing figure spanning these sections may be presented as a single
 * number.
 *
 * False for `mixed`, which is the whole point: a median time-per-question drawn
 * half from a stopwatch and half from someone's memory of last Tuesday is not one
 * measurement, and rendering it as one would be the fabrication rule 5 forbids.
 */
export function canAggregateTiming(sections: TimingSource[]): boolean {
  return rollUpTimingSource(sections) !== "mixed";
}

/**
 * The label for a screen built on these timings.
 *
 * Short and specific, because it appears next to the numbers it qualifies rather
 * than in a footnote nobody reads.
 */
export function timingLabel(source: AttemptTimingSource): string {
  switch (source) {
    case "measured":
      return "TIMING = MEASURED";
    case "estimated":
      return "TIMING = YOUR ESTIMATES";
    case "mixed":
      return "TIMING = PART MEASURED, PART ESTIMATED";
    case "absent":
      return "NO TIMING DATA";
  }
}

/**
 * Longer explanation, for where there is room for one.
 *
 * `mixed` gets the most words because it is the case a student is least likely to
 * anticipate and most likely to misread.
 */
export function timingExplanation(source: AttemptTimingSource): string {
  switch (source) {
    case "measured":
      return "ASHA timed these itself, question by question, as you worked.";
    case "estimated":
      return "You entered these from memory in rough buckets. Useful in aggregate, imprecise individually.";
    case "mixed":
      return "Some sections were timed by ASHA and some you entered from memory. Figures that would combine the two are held back rather than averaged.";
    case "absent":
      return "No timing was recorded for these, so nothing here rests on time.";
  }
}
