"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { QUESTION_TIME_BUCKETS } from "@/lib/timeBuckets";
import {
  freeSkips,
  questionMarks,
  totalQuestionMarks,
  type MarkingScheme,
} from "@/lib/marking";

/**
 * VARC / QA question entry — designs 1e (card by card) and 1f (batch grid).
 *
 * BOTH SHIP, and the student picks per section, because they solve different
 * problems. Batch is the fast path for a section they aced: 22 taps become
 * three. Cards capture everything, which matters for a section they want to
 * dissect.
 *
 * The honest cost of batch mode, surfaced rather than hidden: it only tags
 * confidence on the exceptions. Calibration's whole point is BOTH diagonals —
 * confident-and-wrong and unconfident-and-right — and the second is invisible if
 * you only tag what went wrong. So calibration counts only explicitly tagged
 * answers, and the locked card says so. Nothing is assumed for untagged ones,
 * because inventing a confidence value would be fabrication.
 */

type TypeGroup = { id: string; name: string; leaves: { id: string; name: string }[] };
type NamedNode = { id: string; name: string };

type Status = "attempted" | "skipped" | "revisited";
type ErrorCause = "conceptual" | "misread" | "silly" | "time" | "none";

export type QuestionRow = {
  questionNumber: number;
  typeId: string | null;
  passageDomainId: string | null;
  responseFormat: "mcq" | "tita";
  timeSpentSec: number | null;
  status: Status;
  isCorrect: boolean | null;
  confidence: number | null;
  errorCause: ErrorCause | null;
};

/**
 * Buckets come from lib/timeBuckets, shared with the analytics rather than
 * duplicated here. `timeTraps` defines a trap as "attempts in the slowest
 * bucket", so if entry and analysis held separate copies, a change to one would
 * silently stop the other from ever matching.
 */
const TIME_BUCKETS = QUESTION_TIME_BUCKETS;

const CONFIDENCE = [
  { value: 1, label: "Guessed" },
  { value: 2, label: "Unsure" },
  { value: 3, label: "Certain" },
];

const CAUSES: { value: ErrorCause; label: string }[] = [
  { value: "conceptual", label: "Concept" },
  { value: "misread", label: "Misread" },
  { value: "silly", label: "Silly" },
  { value: "time", label: "Time" },
];

function blankRow(n: number): QuestionRow {
  // Batch mode's premise: everything starts correct, you touch only exceptions.
  return {
    questionNumber: n,
    typeId: null,
    passageDomainId: null,
    responseFormat: "mcq",
    timeSpentSec: null,
    status: "attempted",
    isCorrect: true,
    confidence: null,
    errorCause: null,
  };
}

export default function QuestionSheet({
  attemptId,
  sectionAttemptId,
  sectionCode,
  questionCount,
  reportedSectionScore,
  mockTitle,
  scheme,
  typeGroups,
  passageDomains,
  initialQuestions,
}: {
  attemptId: string;
  sectionAttemptId: string;
  sectionCode: string;
  questionCount: number | null;
  reportedSectionScore: number | null;
  mockTitle: string;
  scheme: MarkingScheme;
  typeGroups: TypeGroup[];
  passageDomains: NamedNode[];
  initialQuestions: QuestionRow[];
}) {
  const router = useRouter();
  const total = questionCount ?? initialQuestions.length ?? 0;

  const [mode, setMode] = useState<"batch" | "cards" | null>(
    initialQuestions.length > 0 ? "batch" : null,
  );
  const [rows, setRows] = useState<QuestionRow[]>(
    initialQuestions.length > 0
      ? initialQuestions
      : Array.from({ length: total }, (_, i) => blankRow(i + 1)),
  );
  const [cursor, setCursor] = useState(0);
  const [taggingExceptions, setTaggingExceptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomes = useMemo(
    () =>
      rows.map((r) => ({
        status: r.status,
        isCorrect: r.isCorrect,
        responseFormat: r.responseFormat,
      })),
    [rows],
  );

  const nRight = rows.filter((r) => r.status !== "skipped" && r.isCorrect === true).length;
  const nWrong = rows.filter((r) => r.status !== "skipped" && r.isCorrect === false).length;
  const nSkip = rows.filter((r) => r.status === "skipped").length;
  const exceptionIndexes = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === "skipped" || r.isCorrect === false)
    .map(({ i }) => i);
  const computed = totalQuestionMarks(scheme, outcomes);
  const blankTitas = freeSkips(outcomes);
  const nTagged = rows.filter((r) => r.confidence !== null).length;

  function update(index: number, patch: Partial<QuestionRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  /** Batch grid: right → wrong → skipped → right. */
  function cycle(index: number) {
    const r = rows[index];
    if (r.status !== "skipped" && r.isCorrect === true) {
      update(index, { status: "attempted", isCorrect: false });
    } else if (r.status !== "skipped" && r.isCorrect === false) {
      update(index, { status: "skipped", isCorrect: null, confidence: null, errorCause: null });
    } else {
      update(index, { status: "attempted", isCorrect: true, errorCause: null });
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      // Delete-then-insert rather than upsert: there is no unique constraint on
      // (section_attempt_id, question_number), and at a few dozen rows this is
      // simpler than inventing one. Makes re-editing a section idempotent.
      const { error: delError } = await supabase
        .from("question_attempts")
        .delete()
        .eq("section_attempt_id", sectionAttemptId);
      if (delError) throw new Error(delError.message);

      const payload = rows.map((r) => ({
        section_attempt_id: sectionAttemptId,
        set_attempt_id: null,
        question_type_id: r.typeId,
        passage_domain_id: r.passageDomainId,
        question_number: r.questionNumber,
        response_format: r.responseFormat,
        time_spent_sec: r.timeSpentSec,
        status: r.status,
        is_correct: r.status === "skipped" ? null : r.isCorrect,
        confidence: r.confidence,
        error_cause: r.errorCause,
        marks_earned: questionMarks(scheme, {
          status: r.status,
          isCorrect: r.isCorrect,
          responseFormat: r.responseFormat,
        }),
      }));

      const { error: insertError } = await supabase.from("question_attempts").insert(payload);
      if (insertError) throw new Error(insertError.message);

      router.push(`/log/${attemptId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this section");
      setBusy(false);
    }
  }

  // ── Mode picker ─────────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <main className="flex min-h-dvh flex-col bg-paper">
        <Header title={`${mockTitle} · ${sectionCode}`} onExit={() => router.push(`/log/${attemptId}`)}>
          How do you want to log {total} questions?
        </Header>
        <div className="flex flex-1 flex-col gap-3 px-5 pt-4">
          <button
            type="button"
            onClick={() => setMode("batch")}
            className="rounded-[14px] border border-ink/[0.12] bg-white p-4 text-left"
          >
            <div className="text-[16px] font-semibold text-ink">Batch &mdash; fastest</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
              All {total} start as <span className="font-semibold text-cleared">Right</span>. Tap only
              what wasn&rsquo;t, then tag those. Best when the section went well.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
              Confidence is only recorded on the ones you flag, so the calibration reading unlocks
              more slowly.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("cards")}
            className="rounded-[14px] border border-ink/[0.12] bg-white p-4 text-left"
          >
            <div className="text-[16px] font-semibold text-ink">Card by card &mdash; complete</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
              Walk every question: type, outcome, how sure you were, roughly how long, and why it went
              wrong. Best for a section you want to pull apart.
            </p>
          </button>
        </div>
      </main>
    );
  }

  // ── Batch grid ──────────────────────────────────────────────────────────
  if (mode === "batch" && !taggingExceptions) {
    return (
      <main className="flex min-h-dvh flex-col bg-paper">
        <div className="border-b border-ink/[0.09] bg-white px-5 pb-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">
              {mockTitle} · {sectionCode}
            </span>
            {/* Actually saves. It said "SAVE & EXIT" and only navigated, which
                broke the one promise this flow makes — that you can stop
                halfway and come back. save() persists and then routes. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="font-mono text-xs font-medium text-brass disabled:opacity-50"
            >
              {busy ? "SAVING…" : "SAVE & EXIT"}
            </button>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6B6659]">
            All {total} start as <span className="font-semibold text-cleared">Right</span>. Tap only
            what wasn&rsquo;t.
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Tally n={nRight} label="RIGHT" tone="bg-cleared/[0.12] text-cleared" />
            <Tally n={nWrong} label="WRONG" tone="bg-bad/10 text-bad" />
            <Tally n={nSkip} label="SKIP" tone="bg-ink/[0.07] text-[#6B6659]" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 px-4 pt-2.5">
          {rows.map((r, i) => {
            const label = r.status === "skipped" ? "SKIPPED" : r.isCorrect ? "RIGHT" : "WRONG";
            const tone =
              r.status === "skipped"
                ? "border-ink/[0.12] bg-ink/[0.04] text-[#6B6659]"
                : r.isCorrect
                  ? "border-ink/[0.09] bg-white text-cleared"
                  : "border-bad/35 bg-bad/[0.07] text-bad";
            return (
              <button
                key={r.questionNumber}
                type="button"
                onClick={() => cycle(i)}
                className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 ${tone}`}
              >
                <span className="tnum w-6 font-mono text-xs text-mute-400">
                  {String(r.questionNumber).padStart(2, "0")}
                </span>
                <span className="flex-1 text-left text-[13.5px] font-medium text-ink">
                  {r.typeId ? typeName(typeGroups, r.typeId) : "Untyped"}
                </span>
                <span className="font-mono text-[11px] font-semibold tracking-[0.06em]">{label}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="px-5 pt-2 text-[12.5px] text-bad">{error}</p>}

        <div className="border-t border-ink/[0.09] bg-white px-5 pb-6 pt-3">
          <p className="mb-2.5 text-[11.5px] leading-relaxed text-mute-500 text-pretty">
            {exceptionIndexes.length === 0
              ? "Nothing flagged. You can save as is, or tag types first."
              : `Next you'll tag the ${exceptionIndexes.length} ${
                  exceptionIndexes.length === 1 ? "exception" : "exceptions"
                } — type, how sure you were, and why.`}
          </p>
          <button
            type="button"
            onClick={() => {
              if (exceptionIndexes.length === 0) {
                void save();
              } else {
                setCursor(exceptionIndexes[0]);
                setTaggingExceptions(true);
              }
            }}
            disabled={busy}
            className="w-full rounded-[13px] bg-ink py-4 text-[15px] font-semibold text-paper transition-opacity disabled:opacity-40"
          >
            {exceptionIndexes.length === 0
              ? busy
                ? "Saving…"
                : `Save ${sectionCode}`
              : "Tag the exceptions →"}
          </button>
        </div>
      </main>
    );
  }

  // ── Detail editor: card-by-card, and batch's exception pass ──────────────
  const walkList = mode === "cards" ? rows.map((_, i) => i) : exceptionIndexes;
  const position = Math.max(0, walkList.indexOf(cursor));
  const row = rows[cursor];
  const isLast = position >= walkList.length - 1;

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="px-5 pb-3 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-[#6B6659]">
            {mockTitle} · {sectionCode}
          </span>
          {/* Saves before leaving — see the note on the batch header. In
              card-by-card mode this is the ONLY way to preserve partial work,
              since the final Save only appears on the last question. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="font-mono text-xs font-medium text-brass disabled:opacity-50"
          >
            {busy ? "SAVING…" : "SAVE & EXIT"}
          </button>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-sm bg-ink/[0.1]">
          <div
            className="h-full rounded-sm bg-brass transition-[width] duration-200"
            style={{ width: `${((position + 1) / Math.max(1, walkList.length)) * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] font-medium text-mute-500">
          <span>
            Q{String(row.questionNumber).padStart(2, "0")} OF {total}
          </span>
          <span>
            {position + 1} / {walkList.length}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5">
        {/* Type */}
        <div className="rounded-[16px] border border-ink/[0.1] bg-white p-4">
          <FieldLabel>WHAT TYPE WAS IT</FieldLabel>
          <select
            value={row.typeId ?? ""}
            onChange={(e) => update(cursor, { typeId: e.target.value || null })}
            className="w-full rounded-xl border border-ink/[0.13] bg-white px-3 py-3 text-[14px] font-medium text-ink focus:border-brass focus:outline-none"
          >
            <option value="">Pick a type…</option>
            {typeGroups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.leaves.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {passageDomains.length > 0 && (
            <>
              <FieldLabel>PASSAGE SUBJECT · IF IT WAS A READING PASSAGE</FieldLabel>
              <select
                value={row.passageDomainId ?? ""}
                onChange={(e) => update(cursor, { passageDomainId: e.target.value || null })}
                className="w-full rounded-xl border border-ink/[0.13] bg-white px-3 py-3 text-[14px] font-medium text-ink focus:border-brass focus:outline-none"
              >
                <option value="">Not a passage question</option>
                {passageDomains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
              ANSWER FORMAT
            </span>
            <div className="flex gap-1.5">
              <Chip
                on={row.responseFormat === "mcq"}
                onClick={() => update(cursor, { responseFormat: "mcq" })}
                small
              >
                MCQ
              </Chip>
              <Chip
                on={row.responseFormat === "tita"}
                onClick={() => update(cursor, { responseFormat: "tita" })}
                small
              >
                TITA
              </Chip>
            </div>
          </div>
          {row.responseFormat === "tita" && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
              No negative marking on TITA &mdash; a wrong answer costs nothing, so leaving one blank
              gives away free marks.
            </p>
          )}
        </div>

        {/* Outcome */}
        <div className="flex gap-2">
          <BigChoice
            on={row.status !== "skipped" && row.isCorrect === false}
            onClick={() =>
              update(cursor, { status: "attempted", isCorrect: false })
            }
            tone="border-bad/45 text-bad"
            onTone="bg-bad text-white"
          >
            Wrong
          </BigChoice>
          <BigChoice
            on={row.status === "skipped"}
            onClick={() =>
              update(cursor, {
                status: "skipped",
                isCorrect: null,
                confidence: null,
              })
            }
            tone="border-ink/[0.18] text-[#6B6659]"
            onTone="bg-ink text-white"
          >
            Skipped
          </BigChoice>
          <BigChoice
            on={row.status !== "skipped" && row.isCorrect === true}
            onClick={() =>
              update(cursor, { status: "attempted", isCorrect: true, errorCause: null })
            }
            tone="border-cleared/50 text-cleared"
            onTone="bg-cleared text-white"
          >
            Right
          </BigChoice>
        </div>

        {/* Confidence — only meaningful when they actually answered. */}
        {row.status !== "skipped" && (
          <div>
            <FieldLabel>HOW SURE WERE YOU, BEFORE CHECKING?</FieldLabel>
            <div className="flex gap-1.5">
              {CONFIDENCE.map((c) => (
                <Chip
                  key={c.value}
                  on={row.confidence === c.value}
                  onClick={() => update(cursor, { confidence: c.value })}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>ROUGHLY HOW LONG? · YOUR ESTIMATE, NOT MEASURED</FieldLabel>
          <div className="flex gap-1.5">
            {TIME_BUCKETS.map((b) => (
              <Chip
                key={b.sec}
                on={row.timeSpentSec === b.sec}
                onClick={() => update(cursor, { timeSpentSec: b.sec })}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Error cause — wrong or skipped only, matching design 1e. */}
        {(row.isCorrect === false || row.status === "skipped") && (
          <div>
            <div className="mb-[7px] font-mono text-[10px] font-medium tracking-[0.14em] text-bad">
              WHY DID IT GO WRONG?
            </div>
            <div className="flex gap-1.5">
              {CAUSES.map((c) => (
                <Chip
                  key={c.value}
                  on={row.errorCause === c.value}
                  onClick={() => update(cursor, { errorCause: c.value })}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        <div className="mt-auto flex items-center gap-2.5 pb-6 pt-3">
          <button
            type="button"
            disabled={position === 0}
            onClick={() => setCursor(walkList[position - 1])}
            className="w-14 rounded-[13px] border border-ink/[0.15] py-4 font-mono text-[15px] text-[#6B6659] disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (isLast) void save();
              else setCursor(walkList[position + 1]);
            }}
            className="flex-1 rounded-[13px] bg-ink py-4 text-[15px] font-semibold text-paper transition-opacity disabled:opacity-40"
          >
            {isLast ? (busy ? "Saving…" : `Save ${sectionCode}`) : "Next question"}
          </button>
        </div>
      </div>

      {/* Running honesty footer: what this section adds up to, and what is still
          untagged. Shown here rather than only at the end, so a mis-entry is
          visible while the paper is still open in front of them. */}
      <div className="border-t border-ink/[0.09] bg-white px-5 py-2.5">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[10.5px] font-medium text-mute-500">
          <span className="tnum">
            LOGGED: {computed} MARKS
            {reportedSectionScore !== null && ` · REPORTED ${reportedSectionScore}`}
          </span>
          <span className="tnum">
            {nTagged}/{total} CONFIDENCE-TAGGED
          </span>
        </div>
        {blankTitas > 0 && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-brass text-pretty">
            {/* Built as one string rather than interleaved JSX expressions: a
                `{expr} word` boundary silently lost its space and rendered
                "questionleft blank". */}
            {`${blankTitas} TITA ${blankTitas === 1 ? "question" : "questions"} left blank`} &mdash;
            those carry no penalty, so a guess was free.
          </p>
        )}
      </div>
    </main>
  );
}

function typeName(groups: TypeGroup[], id: string): string {
  for (const g of groups) {
    const hit = g.leaves.find((l) => l.id === id);
    if (hit) return hit.name;
  }
  return "Untyped";
}

function Header({
  title,
  children,
  onExit,
}: {
  title: string;
  children: React.ReactNode;
  onExit: () => void;
}) {
  return (
    <div className="bg-ink px-5 pb-4 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-paper">{title}</span>
        <button type="button" onClick={onExit} className="font-mono text-xs font-medium text-brass">
          BACK
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">{children}</p>
    </div>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={`flex-1 rounded-lg py-1.5 text-center font-mono text-[11.5px] font-semibold ${tone}`}>
      <span className="tnum">{n}</span> {label}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[7px] mt-3 font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  small,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[10px] ${small ? "px-3 py-1.5 text-[11px]" : "px-3 py-2.5 text-[12.5px]"} ${
        on
          ? "bg-ink font-semibold text-white"
          : "border border-ink/[0.13] bg-white font-medium text-[#6B6659]"
      }`}
    >
      {children}
    </button>
  );
}

function BigChoice({
  on,
  onClick,
  children,
  tone,
  onTone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: string;
  onTone: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[14px] border-[1.5px] py-4 text-[16px] font-semibold ${
        on ? `${onTone} border-transparent` : `bg-white ${tone}`
      }`}
    >
      {children}
    </button>
  );
}
