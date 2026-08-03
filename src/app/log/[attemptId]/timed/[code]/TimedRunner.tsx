"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClock, sectionClock } from "@/lib/sectionClock";

/**
 * In-app timed test mode — v3's headline feature.
 *
 * WHAT THIS DOES AND DOES NOT DO. It does not give you questions: you work from
 * the mock you already own, on paper or on whatever platform you took it. ASHA
 * runs the section clock and records, per question, how long you actually spent
 * and the order you actually worked in. That is the entire job.
 *
 * WHY IT EXISTS. Every timing figure in the app until now has been the student's
 * recollection entered in rough buckets after the fact. Useful in aggregate,
 * imprecise individually, and labelled as such on every screen. This makes them
 * measurements. `timing_source` and `entry_mode` were both put in the schema on
 * day one for precisely this, and NO ANALYTIC CHANGES — only the provenance label
 * does. That was the design intent and it holds.
 *
 * It also finally populates `question_attempts.order_index`, which was documented
 * as "reserved in practice" because neither post-hoc flow could know the order a
 * student worked in. A timer observes it directly.
 *
 * WHAT IT DELIBERATELY CANNOT CAPTURE: whether an answer was right. During a
 * timed run the answer key isn't available — that is what makes it a timed run.
 * So this records time, order, attempted/skipped, and confidence declared in the
 * moment (which is *better* than post-hoc, since "before checking" is literally
 * true here). Correctness and error causes are added afterwards through the
 * existing review flow.
 */

type Phase = "ready" | "running" | "done";

export type TimedQuestion = {
  questionNumber: number;
  /** Seconds spent, measured. */
  timeSpentSec: number;
  /** 1-based order the student actually worked in. */
  orderIndex: number | null;
  status: "attempted" | "skipped";
  confidence: number | null;
};

const CONFIDENCE = [
  { value: 1, label: "Guessed" },
  { value: 2, label: "Unsure" },
  { value: 3, label: "Certain" },
];

export default function TimedRunner({
  attemptId,
  sectionAttemptId,
  sectionCode,
  questionCount,
  timeLimitMin,
  mockTitle,
}: {
  attemptId: string;
  sectionAttemptId: string;
  sectionCode: string;
  questionCount: number;
  timeLimitMin: number | null;
  mockTitle: string;
}) {
  const router = useRouter();

  // Some exams set no sectional clock at all — MAT gives 120 minutes across all
  // five sections and lets you move between them freely, so `time_limit_min` is
  // null for every MAT section by design. A section with a clock counts down and
  // stops itself; a section without one counts up until the student stops it.
  //
  // The derivation lives in lib/sectionClock.ts so it can be unit tested; see
  // that file for what the old `?? 40` fallback would have fabricated here.
  const hasSectionClock = timeLimitMin !== null;

  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(1);
  const [rows, setRows] = useState<TimedQuestion[]>(() =>
    Array.from({ length: questionCount }, (_, i) => ({
      questionNumber: i + 1,
      timeSpentSec: 0,
      orderIndex: null,
      status: "skipped" as const,
      confidence: null,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything the header and the bar need, derived in one tested place.
  const clock = sectionClock({ timeLimitMin, elapsedSec: elapsed, questionCount, currentQuestion: current });

  /**
   * Wall-clock anchored rather than tick-counted. A setInterval that increments a
   * counter drifts, and stops entirely when a mobile browser backgrounds the tab —
   * which would silently under-report time and quietly turn a "measurement" into
   * something worse than the estimate it replaced.
   */
  const startedAt = useRef<number | null>(null);
  const questionStartedAt = useRef<number>(0);
  const orderCounter = useRef(0);

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Auto-stop at the limit. A real section ends whether or not you are ready, and
  // letting the clock run past it would record time the exam would not have given.
  // `clock.expired` is permanently false for an exam with no sectional limit, so
  // that run simply never gets cut off here.
  useEffect(() => {
    if (phase === "running" && clock.expired) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase, clock.expired]);

  // Warn before a reload or close mid-run: the measured times exist only in memory
  // until the section is saved, so a stray refresh would lose the whole run.
  useEffect(() => {
    if (phase !== "running") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const answered = rows.filter((r) => r.status === "attempted").length;

  function start() {
    startedAt.current = Date.now();
    questionStartedAt.current = Date.now();
    setPhase("running");
  }

  /** Commit the time spent on the current question, then move on. */
  function commit(status: "attempted" | "skipped", confidence: number | null) {
    const now = Date.now();
    const spent = Math.max(0, Math.round((now - questionStartedAt.current) / 1000));
    questionStartedAt.current = now;

    // The order index is assigned HERE, outside the state updater, and this is
    // not a style preference. Mutating a ref inside a setState updater is impure,
    // and React StrictMode double-invokes updaters in development specifically to
    // surface that — which it did: orders came out 2, 4, 6 instead of 1, 2, 3.
    // Production would not double-invoke, so the bug would have hidden in dev
    // only to look "fixed" once deployed. Assigned before the updater runs, once.
    const alreadyOrdered = rows[current - 1]?.orderIndex !== null;
    if (!alreadyOrdered) orderCounter.current += 1;
    const assignedOrder = alreadyOrdered ? rows[current - 1].orderIndex : orderCounter.current;

    setRows((prev) =>
      prev.map((r) => {
        if (r.questionNumber !== current) return r;
        // Accumulate, so revisiting a question adds to its total rather than
        // overwriting — a student who comes back to Q7 spent time on it twice.
        return {
          ...r,
          timeSpentSec: r.timeSpentSec + spent,
          orderIndex: assignedOrder,
          status: status === "attempted" ? "attempted" : r.status,
          confidence: confidence ?? r.confidence,
        };
      }),
    );

    if (current < questionCount) setCurrent(current + 1);
    else finish();
  }

  function finish() {
    // Bank whatever time the in-progress question has accrued, so the last
    // question of a run is not silently recorded as zero.
    const now = Date.now();
    const spent = Math.max(0, Math.round((now - questionStartedAt.current) / 1000));
    questionStartedAt.current = now;

    // Time was spent on this one, so it belongs in the attempt order even though
    // it was never committed — the student demonstrably worked on it. Assigned
    // outside the updater for the same purity reason as in commit().
    const needsOrder = spent > 0 && rows[current - 1]?.orderIndex === null;
    if (needsOrder) orderCounter.current += 1;
    const finalOrder = needsOrder ? orderCounter.current : (rows[current - 1]?.orderIndex ?? null);

    setRows((prev) =>
      prev.map((r) =>
        r.questionNumber === current
          ? { ...r, timeSpentSec: r.timeSpentSec + spent, orderIndex: finalOrder }
          : r,
      ),
    );
    setPhase("done");
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/timed/${sectionAttemptId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not save the run");
      router.push(`/log/${attemptId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the run");
      setBusy(false);
    }
  }

  // ── Ready ───────────────────────────────────────────────────────────────
  if (phase === "ready") {
    return (
      <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-6">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          TIMED RUN · {sectionCode}
        </div>
        <div className="mt-1.5 text-[12.5px] text-mute-300">{mockTitle}</div>

        <div className="flex flex-1 flex-col justify-center gap-5">
          <div>
            <div className="tnum font-mono text-[54px] font-semibold leading-none text-paper">
              {hasSectionClock ? formatClock(timeLimitMin * 60) : "00:00"}
            </div>
            <div className="mt-2 font-mono text-[11px] tracking-[0.1em] text-mute-500">
              {questionCount} QUESTIONS
            </div>
          </div>

          <p className="text-[14px] leading-relaxed text-paper text-pretty">
            Have the paper in front of you before you start. ASHA doesn&rsquo;t show you questions
            &mdash; it times you while you work through your own.
          </p>

          <ul className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-mute-300">
            {/* Built as one interpolated string: a `</strong> word` boundary
                silently ate its space here and rendered "Skipas". Same bug as
                the TITA line in QuestionSheet. */}
            <li>
              {"For each question, tap how sure you were — or tap Skip it. Either one records your time and moves on."}
            </li>
            <li>
              Confidence is asked in the moment, genuinely before you check &mdash; which is the only
              point at which that answer means anything.
            </li>
            {/* Two genuinely different promises, so they are two different
                sentences rather than one with a fallback number in it. */}
            <li>
              {hasSectionClock
                ? `The clock stops itself at ${timeLimitMin} minutes, like the real one.`
                : "This exam sets no per-section limit, so the clock counts up and keeps going until you finish the section yourself."}
            </li>
            <li>
              Right and wrong come afterwards, once you have the answer key.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 pb-2">
          <button
            type="button"
            onClick={start}
            className="rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white"
          >
            Start the clock
          </button>
          <button
            type="button"
            onClick={() => router.push(`/log/${attemptId}`)}
            className="font-mono text-[11px] text-mute-500"
          >
            NOT NOW
          </button>
        </div>
      </main>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (phase === "done") {
    const measured = rows.reduce((s, r) => s + r.timeSpentSec, 0);
    return (
      <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-6">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          RUN COMPLETE · {sectionCode}
        </div>

        <div className="flex flex-1 flex-col justify-center gap-5">
          <div className="flex gap-3">
            {/* Seconds below a minute: flooring to minutes reported a 40-second
                run as "0m", which reads as "nothing was recorded" when in fact
                the timings are there. */}
            <Stat
              value={
                measured < 60
                  ? `${measured}s`
                  : `${Math.floor(measured / 60)}m ${measured % 60 === 0 ? "" : `${measured % 60}s`}`.trim()
              }
              label="on the clock"
            />
            <Stat value={String(answered)} label={`of ${questionCount} answered`} />
          </div>

          <div className="rounded-[14px] border border-brass/45 bg-brass/[0.08] px-4 py-3.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-brass">
              MEASURED, NOT RECALLED
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-paper text-pretty">
              These timings were captured as you worked, so every {sectionCode} reading built on
              time is now a measurement rather than your estimate. ASHA will say so.
            </p>
          </div>

          <p className="text-[12.5px] leading-relaxed text-mute-300 text-pretty">
            Next: mark what was right or wrong once you have the answers. Your times and the order
            you worked in are already recorded and won&rsquo;t be touched.
          </p>

          {error && <p className="text-[12.5px] text-bad-soft">{error}</p>}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mb-2 rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save the run"}
        </button>
      </main>
    );
  }

  // ── Running ─────────────────────────────────────────────────────────────
  const row = rows[current - 1];
  const urgent = clock.urgent;

  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-6">
      <div className="flex items-baseline justify-between">
        <div
          className={`tnum font-mono text-[40px] font-semibold leading-none ${
            urgent ? "text-bad-soft" : "text-paper"
          }`}
        >
          {formatClock(clock.displaySec)}
        </div>
        <div className="font-mono text-[11px] text-mute-500">
          {answered}/{questionCount} DONE
        </div>
      </div>

      {/*
        Time towards the sectional limit, or question progress when there is no
        limit for time to be a fraction of. See lib/sectionClock.ts.
      */}
      <div className="mt-3 h-1 overflow-hidden rounded-sm bg-paper/[0.12]">
        <div
          className={`h-full rounded-sm ${urgent ? "bg-bad" : "bg-brass"}`}
          style={{ width: `${clock.progressPct}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-6">
        <div>
          <div className="font-mono text-[11px] tracking-[0.14em] text-mute-500">
            QUESTION
          </div>
          <div className="tnum font-mono text-[64px] font-semibold leading-none text-paper">
            {String(current).padStart(2, "0")}
          </div>
          {row.timeSpentSec > 0 && (
            <div className="mt-1.5 font-mono text-[11px] text-brass">
              {row.timeSpentSec}s already logged here
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
            HOW SURE ARE YOU? · ASKED BEFORE YOU CHECK
          </div>
          <div className="flex gap-2">
            {CONFIDENCE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => commit("attempted", c.value)}
                className="flex-1 rounded-[11px] border border-paper/25 py-3 text-[13px] font-medium text-paper"
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mute-500 text-pretty">
            Picking one records the answer and moves on.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pb-2">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => commit("skipped", null)}
            className="flex-1 rounded-[13px] border border-paper/25 py-3.5 text-[14px] font-semibold text-paper"
          >
            Skip it
          </button>
          <button
            type="button"
            disabled={current === 1}
            onClick={() => {
              // Stepping back banks the current question's time first, so moving
              // around the paper never loses or double-counts seconds.
              const now = Date.now();
              const spent = Math.max(0, Math.round((now - questionStartedAt.current) / 1000));
              questionStartedAt.current = now;
              setRows((prev) =>
                prev.map((r) =>
                  r.questionNumber === current ? { ...r, timeSpentSec: r.timeSpentSec + spent } : r,
                ),
              );
              setCurrent(current - 1);
            }}
            className="w-16 rounded-[13px] border border-paper/25 py-3.5 font-mono text-[15px] text-mute-300 disabled:opacity-30"
          >
            ←
          </button>
        </div>
        <button
          type="button"
          onClick={finish}
          className="font-mono text-[11px] text-mute-500"
        >
          END THE SECTION EARLY
        </button>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-[12px] border border-paper/[0.16] px-3.5 py-3">
      <div className="tnum font-mono text-[24px] font-semibold text-paper">{value}</div>
      <div className="mt-1 text-[11.5px] leading-snug text-mute-500">{label}</div>
    </div>
  );
}
