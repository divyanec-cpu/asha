/**
 * The question-entry time buckets, stored as midpoints in seconds.
 *
 * Shared between the entry UI (QuestionSheet) and the analytics (timeTraps),
 * because the two MUST agree: a trap is defined as "attempts in the slowest
 * bucket", and if entry and analysis had different ideas of the buckets that
 * definition would silently stop matching anything.
 *
 * Midpoints, not measurements — every v1 attempt has timing_source 'estimated'
 * and every view that uses these says so. The 4m+ bucket is unbounded, so 300
 * is a floor rather than an estimate of the mean (data-model.md).
 */
export const QUESTION_TIME_BUCKETS = [
  { label: "<1m", sec: 30 },
  { label: "1–2m", sec: 90 },
  { label: "2–4m", sec: 180 },
  { label: "4m+", sec: 300 },
] as const;

export const QUESTION_BUCKET_SECONDS: number[] = QUESTION_TIME_BUCKETS.map((b) => b.sec);
