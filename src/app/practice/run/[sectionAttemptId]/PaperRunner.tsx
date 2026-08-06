"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClock, sectionClock } from "@/lib/sectionClock";
import { decideWorkingOrder } from "@/lib/workingOrder";
import StimulusChart, { type ChartSpec } from "./StimulusChart";

/**
 * A timed practice run with the questions on screen.
 *
 * Shares its clock with the log-a-mock timer (`lib/sectionClock.ts`) so the two
 * cannot drift, and keeps the same wall-clock anchoring: a tick-counting interval
 * drifts and stops dead when a mobile browser backgrounds the tab, which would
 * under-report time and quietly turn a "measurement" into something worse than the
 * estimate it replaced.
 *
 * WHAT IS CAPTURED, AND WHY EACH ONE
 *   - per-question time: the point of a timed run
 *   - `orderIndex`: the order the student actually worked in, which no earlier flow
 *     ever captured
 *   - `confidence`, declared while answering and therefore genuinely before seeing
 *     the key — the only moment at which that answer means anything
 *   - the response itself, so grading needs no self-report
 *
 * Confidence is OPTIONAL here. In the review flows it gates progress, because there
 * the student already knows the outcome and an untagged answer is a wasted one. In a
 * live run, forcing a second tap on every question would change the pacing being
 * measured. Untagged questions simply do not enter the calibration sample, exactly
 * as CLAUDE.md says of batch mode.
 */

type Question = {
  itemId: string;
  questionNumber: number;
  stem: string;
  responseFormat: "mcq" | "tita";
  options: string[];
  /** Shared passage or set data. Null for a standalone question. */
  stimulusId: string | null;
  stimulusTitle: string | null;
  stimulusBody: string | null;
  stimulusKind: string | null;
  stimulusChart: ChartSpec | null;
};

type Answer = {
  selectedOption: number | null;
  responseText: string | null;
  confidence: number | null;
  timeSpentSec: number;
  orderIndex: number | null;
};

type Phase = "ready" | "running" | "saving" | "error";

const CONFIDENCE = [
  { value: 1, label: "Guessed" },
  { value: 2, label: "Unsure" },
  { value: 3, label: "Certain" },
];

export default function PaperRunner({
  sectionAttemptId,
  attemptId,
  paperTitle,
  sectionCode,
  sectionIndex,
  sectionTotal,
  timeLimitMin,
  questions,
}: {
  sectionAttemptId: string;
  attemptId: string;
  paperTitle: string;
  sectionCode: string;
  sectionIndex: number;
  sectionTotal: number;
  timeLimitMin: number | null;
  questions: Question[];
}) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState<string | null>(null);
  /**
   * Passages the student has folded away, keyed by stimulus id — NOT by question.
   *
   * A reading passage runs several hundred words with four questions hanging off it,
   * and on a 360px screen it fills the viewport. Keying on the stimulus means
   * folding it once keeps it folded across all four of its questions, rather than
   * springing open again every time the student moves to the next one.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Answer[]>(() =>
    questions.map(() => ({
      selectedOption: null,
      responseText: null,
      confidence: null,
      timeSpentSec: 0,
      orderIndex: null,
    })),
  );

  const startedAt = useRef<number | null>(null);
  const questionStartedAt = useRef<number>(0);
  // index → working order. A ref rather than state because it is not render-derived,
  // and because the decision must happen outside any state updater. See
  // lib/workingOrder.ts for the bug this shape exists to prevent.
  const orderAssigned = useRef<Map<number, number>>(new Map());
  const submitted = useRef(false);

  const clock = sectionClock({
    timeLimitMin,
    elapsedSec: elapsed,
    questionCount: questions.length,
    currentQuestion: current,
  });

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  /** Banks the time spent on the question being left. Pure updater: adds only. */
  const bankTime = useCallback((index: number) => {
    const spent = Math.max(0, Math.floor((Date.now() - questionStartedAt.current) / 1000));
    questionStartedAt.current = Date.now();
    setAnswers((prev) =>
      prev.map((a, i) => (i === index ? { ...a, timeSpentSec: a.timeSpentSec + spent } : a)),
    );
  }, []);

  /**
   * Marks this question as visited, in working order, once.
   *
   * The decision and the ref write both happen BEFORE setAnswers, so the updater is
   * pure and StrictMode's double invocation is harmless — it just re-applies the
   * same number. Doing the increment inside the updater is what produced order
   * indices 2, 4, 6 … 28 instead of 1, 2, 3 … 14.
   */
  const noteOrder = useCallback((index: number) => {
    const { order, isNew } = decideWorkingOrder(orderAssigned.current, index);
    if (!isNew) return;
    orderAssigned.current.set(index, order);
    setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, orderIndex: order } : a)));
  }, []);

  const submit = useCallback(
    async (rows: Answer[], totalElapsed: number) => {
      if (submitted.current) return;
      submitted.current = true;
      setPhase("saving");

      const payload = questions.map((q, i) => ({
        questionItemId: q.itemId,
        questionNumber: q.questionNumber,
        selectedOption: rows[i].selectedOption,
        responseText: rows[i].responseText,
        confidence: rows[i].confidence,
        timeSpentSec: rows[i].timeSpentSec,
        orderIndex: rows[i].orderIndex,
      }));

      try {
        const res = await fetch(`/api/practice/${sectionAttemptId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload, timeUsedSec: totalElapsed }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          submitted.current = false;
          setError(body.error ?? "Could not save this run.");
          setPhase("error");
          return;
        }
        /*
         * A full mock hands over to its next section rather than ending. The server
         * decides which section that is; the client only follows, so a tampered
         * response cannot make it skip one.
         *
         * `router.refresh()` before the push matters: the next section is a
         * different route parameter but the same route, and without it Next serves
         * the cached RSC payload and the student sees the section they just
         * finished.
         */
        if (typeof body.nextSectionAttemptId === "string") {
          submitted.current = false;
          router.refresh();
          router.push(`/practice/run/${body.nextSectionAttemptId}`);
          return;
        }
        router.push(`/log/${attemptId}`);
      } catch {
        submitted.current = false;
        setError("Could not reach the server. Your answers are still on screen — try again.");
        setPhase("error");
      }
    },
    [attemptId, questions, router, sectionAttemptId],
  );

  /** Banks the open question's time, then submits everything. */
  const finish = useCallback(() => {
    const spent = Math.max(0, Math.floor((Date.now() - questionStartedAt.current) / 1000));
    const index = current - 1;
    const rows = answers.map((a, i) =>
      i === index ? { ...a, timeSpentSec: a.timeSpentSec + spent } : a,
    );
    setAnswers(rows);
    void submit(rows, elapsed);
  }, [answers, current, elapsed, submit]);

  // Auto-submit at the limit. Never fires for a paper with no clock, because
  // `clock.expired` is permanently false there.
  useEffect(() => {
    if (phase === "running" && clock.expired) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase, clock.expired]);

  // A reload mid-run loses every timing, which exist only in memory until submit.
  useEffect(() => {
    if (phase !== "running") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  function start() {
    startedAt.current = Date.now();
    questionStartedAt.current = Date.now();
    setPhase("running");
    noteOrder(0);
  }

  function goTo(questionNumber: number) {
    if (questionNumber < 1 || questionNumber > questions.length) return;
    bankTime(current - 1);
    setCurrent(questionNumber);
    noteOrder(questionNumber - 1);
  }

  function setAnswer(patch: Partial<Answer>) {
    setAnswers((prev) => prev.map((a, i) => (i === current - 1 ? { ...a, ...patch } : a)));
  }

  const answeredCount = answers.filter(
    (a) => a.selectedOption !== null || (a.responseText ?? "").trim().length > 0,
  ).length;

  // ── Ready ───────────────────────────────────────────────────────────────
  if (phase === "ready") {
    return (
      <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-6">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          {sectionTotal > 1
            ? `${sectionCode} · SECTION ${sectionIndex} OF ${sectionTotal}`
            : `PRACTICE · ${sectionCode}`}
        </div>
        <div className="mt-1.5 text-[12.5px] text-mute-300">{paperTitle}</div>

        <div className="flex flex-1 flex-col justify-center gap-5">
          <div>
            <div className="tnum font-mono text-[54px] font-semibold leading-none text-paper">
              {timeLimitMin === null ? "00:00" : formatClock(timeLimitMin * 60)}
            </div>
            <div className="mt-2 font-mono text-[11px] tracking-[0.1em] text-mute-500">
              {questions.length} QUESTIONS
            </div>
          </div>

          <ul className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-mute-300">
            <li>
              {timeLimitMin === null
                ? "There is no time limit on this paper — the clock counts up and stops when you submit."
                : `The clock stops itself at ${timeLimitMin} minutes and submits what you have.`}
            </li>
            <li>
              {"Move freely between questions. ASHA records the order you actually worked in, which is worth as much as the timings."}
            </li>
            <li>
              {"Saying how sure you were is optional and takes one tap. Only tagged answers count towards your calibration — but tag it honestly or it is worth nothing."}
            </li>
            {sectionTotal > 1 && (
              <li>
                {`This is section ${sectionIndex} of ${sectionTotal}. Submitting moves you on, and like the real exam you cannot come back to it.`}
              </li>
            )}
            <li>Marked automatically when you submit. Nothing to check by hand.</li>
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
            onClick={() => router.push("/practice")}
            className="py-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-mute-500"
          >
            NOT NOW
          </button>
        </div>
      </main>
    );
  }

  // ── Saving / error ──────────────────────────────────────────────────────
  if (phase === "saving" || phase === "error") {
    return (
      <main className="safe-top safe-bottom flex min-h-dvh flex-col items-center justify-center bg-ink px-6">
        {phase === "saving" ? (
          <>
            <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-brass">
              MARKING
            </div>
            <p className="mt-3 text-center text-[13px] leading-relaxed text-mute-300">
              Grading your answers and working out your timings.
            </p>
          </>
        ) : (
          <>
            <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-bad-soft">
              COULD NOT SAVE
            </div>
            <p className="mt-3 max-w-xs text-center text-[13px] leading-relaxed text-mute-300">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("running");
                setError(null);
              }}
              className="mt-5 rounded-[10px] bg-brass px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.06em] text-white"
            >
              BACK TO THE PAPER
            </button>
          </>
        )}
      </main>
    );
  }

  // ── Running ─────────────────────────────────────────────────────────────
  const q = questions[current - 1];
  const a = answers[current - 1];
  const urgent = clock.urgent;

  /*
   * LAYOUT NOTE — this screen is the one place ASHA is not phone-first.
   *
   * The rest of the app is built for a phone because logging a mock is an evening,
   * ten-minute, on-the-sofa activity. Sitting a 40-minute timed paper is not: it is
   * done at a desk, and on a laptop a single 360px column would waste most of the
   * screen and force the student to scroll between the passage and the options on
   * every question — which, in a run whose whole purpose is measured timing, would
   * put the interface into the measurement.
   *
   * So the runner caps its width and, from `lg` up, puts the exhibit beside the
   * question rather than above it, with the exhibit sticky so it stays put while the
   * question column moves. Below `lg` nothing changes.
   */
  const hasStimulus = q.stimulusBody !== null && q.stimulusId !== null;

  return (
    <main
      data-wide
      className="safe-top safe-bottom flex min-h-dvh flex-col items-center bg-ink px-5"
    >
      <div
        className={`flex w-full flex-1 flex-col ${hasStimulus ? "max-w-xl lg:max-w-6xl" : "max-w-xl"}`}
      >
      <div className="flex items-baseline justify-between">
        <div
          className={`tnum font-mono text-[34px] font-semibold leading-none ${
            urgent ? "text-bad-soft" : "text-paper"
          }`}
        >
          {formatClock(clock.displaySec)}
        </div>
        <div className="font-mono text-[11px] text-mute-500">
          {answeredCount}/{questions.length} ANSWERED
        </div>
      </div>

      <div className="mt-2.5 h-1 overflow-hidden rounded-sm bg-paper/[0.12]">
        <div
          className={`h-full rounded-sm ${urgent ? "bg-bad" : "bg-brass"}`}
          style={{ width: `${clock.progressPct}%` }}
        />
      </div>

      {/* Question navigator — how a real test paper lets you move around. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {questions.map((item, i) => {
          const ans = answers[i];
          const done = ans.selectedOption !== null || (ans.responseText ?? "").trim().length > 0;
          const here = i + 1 === current;
          return (
            <button
              key={item.itemId}
              type="button"
              onClick={() => goTo(i + 1)}
              className={`tnum h-7 w-7 rounded font-mono text-[11px] font-semibold ${
                here
                  ? "bg-brass text-white"
                  : done
                    ? "bg-cleared/80 text-white"
                    : "bg-paper/[0.12] text-mute-300"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-1 flex-col">
        <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-brass">
          QUESTION {String(current).padStart(2, "0")}
          <span className="ml-2 text-mute-500">
            {q.responseFormat === "tita" ? "TYPE THE ANSWER" : "ONE CORRECT OPTION"}
          </span>
        </div>

        {/* Stacked on a phone; exhibit beside question from `lg` up. */}
        <div
          className={`mt-3 flex-1 ${
            hasStimulus ? "lg:grid lg:grid-cols-2 lg:items-start lg:gap-7" : ""
          }`}
        >
        {/*
          The shared passage, above the question that asks about it on a phone and
          beside it on a laptop. Either way it scrolls inside its own box rather than
          pushing the options off the screen — on a 360px viewport a 400-word passage
          is several screens tall, and having to scroll past all of it to reach the
          answers on every question would make the measured timings say more about
          the interface than about the reading.
        */}
        {/* Written out rather than using `hasStimulus`, because TypeScript narrows
            the nullable fields through this form and not through a boolean. */}
        {q.stimulusBody !== null && q.stimulusId !== null && (
          <div className="rounded-[12px] border border-paper/[0.16] bg-paper/[0.05] lg:sticky lg:top-4">
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(q.stimulusId!)) next.delete(q.stimulusId!);
                  else next.add(q.stimulusId!);
                  return next;
                })
              }
              className="flex w-full items-center justify-between px-3.5 py-2.5"
            >
              <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-brass">
                {q.stimulusTitle
                  ? q.stimulusTitle.toUpperCase()
                  : q.stimulusKind === "passage"
                    ? "THE PASSAGE"
                    : "THE SET"}
              </span>
              <span className="ml-2 font-mono text-[10px] font-semibold tracking-[0.06em] text-mute-500">
                {collapsed.has(q.stimulusId) ? "SHOW" : "HIDE"}
              </span>
            </button>
            {/*
              A DILR exhibit is a table or a list of conditions, where the line
              breaks ARE the structure — reflowing it as prose would destroy the
              alignment and make the set unreadable. So set data keeps its
              whitespace and takes the mono face (which is also the design system's
              rule for anything numeric), and scrolls horizontally rather than
              wrapping a table mid-row. Prose passages reflow as normal.
            */}
            {!collapsed.has(q.stimulusId) && (
              <div
                className={`max-h-[42vh] overflow-y-auto border-t border-paper/[0.12] px-3.5 py-3 lg:max-h-[64vh] ${
                  q.stimulusKind === "set_data" ? "overflow-x-auto" : ""
                }`}
              >
                {/*
                  The chart sits above its prose, because the prose usually explains
                  what the axes mean. Values are deliberately NOT printed on the
                  marks — see StimulusChart for why, and why the questions are
                  written to tolerate reading precision.
                */}
                {q.stimulusChart !== null && (
                  <div className="mb-3">
                    <StimulusChart spec={q.stimulusChart} />
                  </div>
                )}
                {q.stimulusBody.split("\n\n").map((block, i) => {
                  /*
                   * Only blocks the author put LINE BREAKS in are structural — a
                   * table, or a numbered list of conditions — and those must keep
                   * their whitespace. A prose block inside a set (the sentence
                   * introducing the table) has no internal breaks and must wrap
                   * normally.
                   *
                   * Rendering every block of a set as <pre> was the first attempt,
                   * and at 360px it made the intro sentence 655px wide: you had to
                   * scroll sideways to read an English sentence. The page body never
                   * scrolled, so it looked contained — it was simply unreadable.
                   */
                  const isStructural = q.stimulusKind === "set_data" && block.includes("\n");
                  return isStructural ? (
                    <pre
                      key={i}
                      className="mb-3 overflow-x-auto whitespace-pre font-mono text-[12px] leading-relaxed text-paper/90 last:mb-0"
                    >
                      {block}
                    </pre>
                  ) : (
                    <p
                      key={i}
                      className="mb-2.5 text-[13.5px] leading-relaxed text-paper/90 text-pretty last:mb-0"
                    >
                      {block}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* The question column: stem, answer, confidence. */}
        <div className={hasStimulus ? "lg:pt-0" : ""}>
        <p className="mt-4 text-[15px] leading-relaxed text-paper text-pretty lg:mt-0">{q.stem}</p>

        {q.responseFormat === "mcq" ? (
          <div className="mt-4 flex flex-col gap-2">
            {q.options.map((option, i) => {
              const chosen = a.selectedOption === i + 1;
              return (
                <button
                  key={i}
                  type="button"
                  // Tapping the chosen option again clears it, because a real paper
                  // lets you un-answer and leaving it stuck would force a guess.
                  onClick={() => setAnswer({ selectedOption: chosen ? null : i + 1 })}
                  className={`flex items-center gap-3 rounded-[11px] border px-3.5 py-3 text-left ${
                    chosen
                      ? "border-brass bg-brass/[0.16]"
                      : "border-paper/[0.16] bg-paper/[0.04]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold ${
                      chosen ? "bg-brass text-white" : "bg-paper/[0.12] text-mute-300"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-[14px] leading-snug text-paper">{option}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <input
              type="text"
              inputMode="decimal"
              value={a.responseText ?? ""}
              onChange={(e) => setAnswer({ responseText: e.target.value })}
              placeholder="Your answer"
              className="w-full rounded-[11px] border border-paper/[0.16] bg-paper/[0.04] px-3.5 py-3 font-mono text-[16px] text-paper placeholder:text-mute-500 focus:border-brass focus:outline-none"
            />
            <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-mute-500">
              NO NEGATIVE MARKING ON TYPED ANSWERS UNDER CAT — A CONSIDERED GUESS COSTS NOTHING
            </p>
          </div>
        )}

        {/* Optional, one tap, and genuinely before the key is visible. */}
        <div className="mt-5">
          <div className="font-mono text-[10px] font-semibold tracking-[0.12em] text-mute-500">
            HOW SURE ARE YOU? · OPTIONAL
          </div>
          <div className="mt-2 flex gap-2">
            {CONFIDENCE.map((c) => {
              const on = a.confidence === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setAnswer({ confidence: on ? null : c.value })}
                  className={`flex-1 rounded-[9px] border py-2 font-mono text-[10.5px] font-semibold tracking-[0.04em] ${
                    on
                      ? "border-brass bg-brass text-white"
                      : "border-paper/[0.16] text-mute-300"
                  }`}
                >
                  {c.label.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
        </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pb-2 pt-5 lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-4">
        <div className="flex gap-2 lg:w-[320px]">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 1}
            className="flex-1 rounded-[10px] border border-paper/[0.16] py-3 font-mono text-[11px] font-semibold tracking-[0.06em] text-mute-300 disabled:opacity-35"
          >
            ← PREVIOUS
          </button>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current === questions.length}
            className="flex-1 rounded-[10px] bg-paper/[0.12] py-3 font-mono text-[11px] font-semibold tracking-[0.06em] text-paper disabled:opacity-35"
          >
            NEXT →
          </button>
        </div>
        <button
          type="button"
          onClick={finish}
          className="rounded-[13px] bg-brass py-3.5 text-[14px] font-semibold text-white lg:px-8 lg:py-3"
        >
          {sectionIndex < sectionTotal ? "Submit and start the next section" : "Submit and mark"}
        </button>
      </div>
      </div>
    </main>
  );
}
