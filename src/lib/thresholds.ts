/**
 * Evidence thresholds — the single source of truth.
 *
 * These numbers are published in docs/data-model.md rather than living only
 * here, because the target user is analytical and sceptical and will reasonably
 * ask "on what basis?". If you change one, change it in both places in the same
 * commit.
 *
 * The rule they enforce (CLAUDE.md, positioning rule 3): an insight below its
 * threshold is NOT SHOWN AT ALL. Below threshold the UI states what is missing
 * — "3 more Games & Tournaments sets before this is reliable" — which is itself
 * useful information.
 *
 * No component may hardcode any of these values.
 */

/** The seven insight kinds, matching the check constraint on `insights.kind`. */
export type InsightKind =
  | "set_selection"
  | "skip_regret"
  | "time_trap"
  | "quadrant"
  | "calibration"
  | "error_cause"
  | "pacing";

export type ConfidenceLabel = "low" | "medium" | "high";

/**
 * Minimum observations before a claim of each kind may be shown.
 *
 * What "one observation" counts as differs per kind, and the unit matters more
 * than the number — see UNITS below.
 */
export const MIN_INSTANCES: Record<InsightKind, number> = {
  set_selection: 5,
  skip_regret: 5,
  time_trap: 5,
  quadrant: 8,
  calibration: 30,
  error_cause: 10,
  pacing: 3,
};

/**
 * What is being counted, for each kind. Kept alongside the numbers because
 * "5" means five completely different things across these rows, and reading
 * MIN_INSTANCES without this is how a threshold gets applied to the wrong unit.
 */
export const UNITS: Record<InsightKind, string> = {
  set_selection: "sets of that archetype",
  // No comma: this is interpolated into "{n} more {unit} before this is
  // reliable", and a trailing clause with a comma read as "3 more skipped sets,
  // across at least 3 mocks before this is reliable."
  skip_regret: "skipped sets across at least 3 mocks",
  time_trap: "attempts of that question type",
  quadrant: "attempts of that question type",
  calibration: "explicitly confidence-tagged answers",
  error_cause: "tagged errors in that section",
  pacing: "mocks with quarter marks recorded",
};

/**
 * Additional constraints that a single count cannot express.
 *
 * skip_regret needs its 5 skipped sets spread across at least 3 mocks: five
 * skips inside one bad mock is one event, not a pattern.
 */
export const MIN_MOCKS: Partial<Record<InsightKind, number>> = {
  skip_regret: 3,
};

/** Confidence labels are multiples of the threshold: low 1x, medium 2x, high 3x. */
export const CONFIDENCE_MULTIPLES = { low: 1, medium: 2, high: 3 } as const;

/** True when a claim of this kind may be shown at all. */
export function meetsThreshold(
  kind: InsightKind,
  n: number,
  mockCount?: number,
): boolean {
  if (n < MIN_INSTANCES[kind]) return false;

  const requiredMocks = MIN_MOCKS[kind];
  if (requiredMocks !== undefined) {
    // Absent mock count cannot be assumed sufficient — refusing to claim is the
    // safe direction, and this is the whole point of the honest-data rule.
    if (mockCount === undefined || mockCount < requiredMocks) return false;
  }

  return true;
}

/**
 * The confidence label for a claim resting on `n` observations.
 *
 * Returns null below threshold — deliberately not "low", because below
 * threshold there is no claim to label, and returning a label would invite a
 * caller to render one.
 */
export function confidenceLabel(
  kind: InsightKind,
  n: number,
): ConfidenceLabel | null {
  const min = MIN_INSTANCES[kind];
  if (n < min) return null;
  if (n >= min * CONFIDENCE_MULTIPLES.high) return "high";
  if (n >= min * CONFIDENCE_MULTIPLES.medium) return "medium";
  return "low";
}

/**
 * How many more observations are needed, for the locked-card copy.
 * Returns 0 once the threshold is met.
 */
export function remaining(kind: InsightKind, n: number): number {
  return Math.max(0, MIN_INSTANCES[kind] - n);
}

/**
 * The locked-card sentence. Stating what is missing is the product's honesty
 * argument made visible, so this string is a feature rather than an error
 * message.
 */
export function shortfallMessage(kind: InsightKind, n: number): string | null {
  const short = remaining(kind, n);
  if (short === 0) return null;
  const unit = UNITS[kind];
  return `${short} more ${unit} before this is reliable.`;
}
