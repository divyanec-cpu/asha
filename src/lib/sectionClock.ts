/**
 * The section clock, as a pure function.
 *
 * Extracted from TimedRunner so it can be tested without a renderer. The reason
 * it is worth extracting at all: this is where a fabricated time limit would get
 * invented, and CLAUDE.md rule 5 forbids exactly that.
 *
 * `timeLimitMin` comes from `sections.time_limit_min` and is NULL for exams with
 * no sectional clock — MAT gives 120 minutes across all five sections and lets
 * the student move between them freely. TimedRunner previously read
 * `(timeLimitMin ?? 40) * 60`, which was invisible for CAT (every section is 40
 * minutes) but against a MAT section would have invented a 40-minute limit, cut
 * the run off there, and told the student the clock "stops itself at 40 minutes,
 * like the real one" — a limit the exam does not impose. It was also a hardcoded
 * exam fact, which rule 7 forbids independently.
 */

export type SectionClock = {
  /** Countdown against a real limit, or count-up when the exam sets none. */
  readonly mode: "countdown" | "countup";
  /** Seconds to display. */
  readonly displaySec: number;
  /** True once the run has hit the sectional limit. Never true without a limit. */
  readonly expired: boolean;
  /** Show the last-two-minutes warning. Never true without a limit. */
  readonly urgent: boolean;
  /**
   * Progress bar, 0-100. Against a limit this is elapsed time. Without one there
   * is no deadline to be a fraction of, so it becomes question progress rather
   * than implying a limit that does not exist.
   */
  readonly progressPct: number;
};

export function sectionClock({
  timeLimitMin,
  elapsedSec,
  questionCount,
  currentQuestion,
}: {
  timeLimitMin: number | null;
  elapsedSec: number;
  questionCount: number;
  currentQuestion: number;
}): SectionClock {
  if (timeLimitMin === null) {
    return {
      mode: "countup",
      displaySec: Math.max(0, elapsedSec),
      // Nothing to expire against, and nothing to be urgent about.
      expired: false,
      urgent: false,
      progressPct:
        questionCount > 0
          ? Math.min(100, Math.max(0, (currentQuestion / questionCount) * 100))
          : 0,
    };
  }

  const totalSec = timeLimitMin * 60;
  const remaining = Math.max(0, totalSec - elapsedSec);
  return {
    mode: "countdown",
    displaySec: remaining,
    expired: elapsedSec >= totalSec,
    urgent: remaining <= 120,
    progressPct: Math.min(100, Math.max(0, (elapsedSec / totalSec) * 100)),
  };
}

/** mm:ss, and it keeps counting past 99 minutes rather than wrapping. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
