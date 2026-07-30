"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { questionCoverage, reconcileSectionScore, setMarks, type MarkingScheme } from "@/lib/marking";

/**
 * Design 1g — the DILR set sheet.
 *
 * This is the most important screen in the product. Every set on the paper gets a
 * row, INCLUDING the ones the student never opened, because the whole DILR
 * problem is selection: with five sets and time for three, the marks come from
 * picking correctly rather than from solving faster. A `chosen = false` row with
 * a verdict of `skipped_would_have_cleared` is the most valuable row in the
 * database, and it is also the one the student is least inclined to enter — so
 * this flow has to make it nearly free.
 *
 * Completeness is measured by question accounting, not by a hardcoded set count:
 * the sheet is done when the sets' question counts sum to the section's. The
 * number of DILR sets is an exam fact that has varied, so it belongs in data.
 */

type Archetype = { id: string; name: string; description: string | null };

type Verdict =
  | "cleared"
  | "attempted_failed"
  | "abandoned_midway"
  | "skipped_would_have_cleared"
  | "skipped_correctly";

type SetRow = {
  id: string;
  archetypeId: string | null;
  label: string | null;
  numQuestions: number;
  numAttempted: number | null;
  numCorrect: number | null;
  chosen: boolean;
  selectionOrder: number | null;
  timeSpentSec: number;
  marksEarned: number;
  verdict: Verdict | null;
};

/** Time buckets. Values are bucket midpoints in seconds — see the timing
 *  provenance note in data-model.md. Never presented as measurements. */
const OPENED_TIME_BUCKETS = [
  { label: "~4m", sec: 240 },
  { label: "~6m", sec: 360 },
  { label: "~9m", sec: 540 },
  { label: "~12m", sec: 720 },
  { label: "15m+", sec: 900 },
];

/** A set you didn't open still costs the time you spent deciding that. */
const SCAN_TIME_BUCKETS = [
  { label: "0", sec: 0 },
  { label: "~1m", sec: 60 },
  { label: "2m+", sec: 120 },
];

const VERDICT_META: Record<Verdict, { badge: string; tone: string }> = {
  cleared: { badge: "CLEARED", tone: "bg-cleared text-white" },
  attempted_failed: { badge: "FAILED", tone: "bg-bad text-white" },
  abandoned_midway: { badge: "ABANDONED", tone: "bg-warn text-white" },
  skipped_would_have_cleared: { badge: "SKIPPED — COULD HAVE", tone: "bg-brass text-white" },
  skipped_correctly: { badge: "SKIPPED — RIGHTLY", tone: "bg-ink/10 text-[#6B6659]" },
};

export default function SetSheet({
  sectionAttemptId,
  sectionCode,
  sectionQuestionCount,
  reportedSectionScore,
  mockTitle,
  scheme,
  archetypes,
  initialSets,
}: {
  attemptId: string;
  sectionAttemptId: string;
  sectionCode: string;
  sectionQuestionCount: number | null;
  reportedSectionScore: number | null;
  mockTitle: string;
  scheme: MarkingScheme;
  archetypes: Archetype[];
  initialSets: SetRow[];
}) {
  const router = useRouter();
  const [sets, setSets] = useState<SetRow[]>(initialSets);
  const [adding, setAdding] = useState(initialSets.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverage = useMemo(
    () => questionCoverage(sets.map((s) => ({ numQuestions: s.numQuestions })), sectionQuestionCount),
    [sets, sectionQuestionCount],
  );

  const reconciliation = useMemo(
    () =>
      reconcileSectionScore(
        scheme,
        sets.map((s) => ({
          numQuestions: s.numQuestions,
          attempted: s.numAttempted ?? 0,
          correct: s.numCorrect ?? 0,
        })),
        reportedSectionScore,
      ),
    [sets, scheme, reportedSectionScore],
  );

  const skippedWouldHaveCleared = sets.filter(
    (s) => s.verdict === "skipped_would_have_cleared",
  ).length;

  // Only reconcile once every question is accounted for. Until then the running
  // total is SUPPOSED to be short of the reported score, so showing a mismatch
  // mid-entry is noise that trains the student to ignore the one warning here
  // that actually matters. Falls back to "any sets logged" when the section has
  // no configured question count and completeness is therefore unknowable.
  const showMismatch =
    reconciliation.mismatch &&
    (coverage.complete || (coverage.expected === null && sets.length > 0));

  async function saveSet(draft: DraftSet) {
    setError(null);
    setBusy(true);
    try {
      const tally = { numQuestions: draft.numQuestions, attempted: draft.attempted, correct: draft.correct };
      const marks = draft.chosen ? setMarks(scheme, tally) : 0;

      const { data, error: insertError } = await supabase
        .from("set_attempts")
        .insert({
          section_attempt_id: sectionAttemptId,
          archetype_id: draft.archetypeId,
          label: `Set ${sets.length + 1}`,
          num_questions: draft.numQuestions,
          num_attempted: draft.chosen ? draft.attempted : null,
          num_correct: draft.chosen ? draft.correct : null,
          chosen: draft.chosen,
          selection_order: draft.chosen ? draft.selectionOrder : null,
          time_spent_sec: draft.timeSpentSec,
          marks_earned: marks,
          solvable_verdict: draft.verdict,
        })
        .select(
          "id, archetype_id, label, num_questions, num_attempted, num_correct, chosen, selection_order, time_spent_sec, marks_earned, solvable_verdict",
        )
        .single();
      if (insertError) throw new Error(insertError.message);

      setSets((prev) => [
        ...prev,
        {
          id: data.id,
          archetypeId: data.archetype_id,
          label: data.label,
          numQuestions: data.num_questions,
          numAttempted: data.num_attempted,
          numCorrect: data.num_correct,
          chosen: data.chosen,
          selectionOrder: data.selection_order,
          timeSpentSec: data.time_spent_sec,
          marksEarned: Number(data.marks_earned ?? 0),
          verdict: data.solvable_verdict,
        },
      ]);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the set");
    } finally {
      setBusy(false);
    }
  }

  async function removeSet(id: string) {
    setError(null);
    const { error: delError } = await supabase.from("set_attempts").delete().eq("id", id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setSets((prev) => prev.filter((s) => s.id !== id));
  }

  function archetypeName(id: string | null) {
    return archetypes.find((a) => a.id === id)?.name ?? "Unknown shape";
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-paper">
            {mockTitle} · {sectionCode}
          </span>
          <button
            type="button"
            onClick={() => router.push("/log")}
            className="font-mono text-xs font-medium text-brass"
          >
            SAVE &amp; EXIT
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          Log every set, including the ones you never opened. Those are the ones that teach us
          something.
        </p>
      </div>

      {/* Question accounting — the completeness rule, made visible. */}
      <div className="border-b border-ink/[0.08] bg-white px-5 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] font-medium tracking-[0.14em] text-mute-500">
            QUESTIONS ACCOUNTED FOR
          </span>
          <span
            className={`tnum font-mono text-[12.5px] font-semibold ${
              coverage.over ? "text-bad" : coverage.complete ? "text-cleared" : "text-ink"
            }`}
          >
            {coverage.accounted}
            {coverage.expected !== null && ` / ${coverage.expected}`}
          </span>
        </div>
        {coverage.expected !== null && (
          <div className="mt-2 h-1 overflow-hidden rounded-sm bg-ink/[0.1]">
            <div
              className={`h-full rounded-sm ${coverage.over ? "bg-bad" : "bg-brass"}`}
              style={{
                width: `${Math.min(100, (coverage.accounted / coverage.expected) * 100)}%`,
              }}
            />
          </div>
        )}
        {coverage.over && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-bad text-pretty">
            That&rsquo;s more questions than {sectionCode} has. One set is probably entered twice, or
            with the wrong size.
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4">
        {sets.map((s) => {
          const meta = s.verdict ? VERDICT_META[s.verdict] : null;
          return (
            <div
              key={s.id}
              className="rounded-[13px] border border-ink/[0.12] bg-white px-4 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14.5px] font-semibold text-ink">
                  {s.label} · {archetypeName(s.archetypeId)}
                </span>
                {meta && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] ${meta.tone}`}
                  >
                    {meta.badge}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[11.5px] font-medium text-[#6B6659]">
                <span>{s.chosen ? `PICKED ${ordinal(s.selectionOrder)}` : "NOT OPENED"}</span>
                {/* No tilde on zero: "~0 MIN" reads as an approximation of
                    nothing. Zero is an exact answer — they didn't look at it. */}
                <span>
                  {s.timeSpentSec === 0 ? "NO TIME SPENT" : `~${Math.round(s.timeSpentSec / 60)} MIN`}
                </span>
                {s.chosen && (
                  <span>
                    {s.numCorrect ?? 0}/{s.numAttempted ?? 0} of {s.numQuestions}
                  </span>
                )}
                {!s.chosen && <span>{s.numQuestions} Q</span>}
                {s.chosen && (
                  <span className={s.marksEarned > 0 ? "text-cleared" : s.marksEarned < 0 ? "text-bad" : ""}>
                    {s.marksEarned > 0 ? "+" : ""}
                    {s.marksEarned}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void removeSet(s.id)}
                  className="ml-auto text-[10.5px] text-mute-400 underline"
                >
                  REMOVE
                </button>
              </div>
            </div>
          );
        })}

        {adding ? (
          <AddSetForm
            archetypes={archetypes}
            nextOrder={sets.filter((s) => s.chosen).length + 1}
            remaining={coverage.remaining}
            busy={busy}
            onCancel={sets.length > 0 ? () => setAdding(false) : undefined}
            onSave={(draft) => void saveSet(draft)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center justify-between rounded-[13px] border border-dashed border-ink/25 px-4 py-3.5"
          >
            <span className="text-[14px] font-medium text-mute-500">
              {coverage.remaining !== null && coverage.remaining > 0
                ? `Add the next set — ${coverage.remaining} questions unaccounted for`
                : "Add another set"}
            </span>
            <span className="font-mono text-[11px] text-brass">ADD →</span>
          </button>
        )}

        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {/* Cross-check against the reported section score. */}
        {showMismatch && (
          <div className="rounded-[13px] border border-warn/50 bg-warn/[0.08] px-4 py-3.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-warn">
              DOESN&rsquo;T ADD UP YET
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink text-pretty">
              Your sets come to {reconciliation.computed} marks, but you reported{" "}
              {reconciliation.reported} for {sectionCode}.
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#6B6659] text-pretty">
              Usually a missed set, or a tally that&rsquo;s out. Small gaps are normal — ASHA assumes
              MCQ negative marking, and TITA questions carry none.
            </p>
          </div>
        )}

        {skippedWouldHaveCleared > 0 && (
          <div className="rounded-[13px] bg-ink px-4 py-3.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-brass">
              WORTH KNOWING
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-paper text-pretty">
              You walked past {skippedWouldHaveCleared}{" "}
              {skippedWouldHaveCleared === 1 ? "set you could have cleared" : "sets you could have cleared"}.
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-mute-300 text-pretty">
              One mock isn&rsquo;t a pattern. Skip regret needs 5 skipped sets across 3 mocks before
              ASHA will call it anything.
            </p>
          </div>
        )}

        <div className="mt-auto pb-6 pt-2">
          <button
            type="button"
            onClick={() => router.push("/log")}
            className="w-full rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white"
          >
            {coverage.complete ? `${sectionCode} done` : `Save ${sectionCode} for now`}
          </button>
          <p className="mt-3 text-center text-[11.5px] leading-relaxed text-mute-400 text-pretty">
            VARC and QA entry arrive next. This attempt stays unfinished until all three are logged.
          </p>
        </div>
      </div>
    </main>
  );
}

type DraftSet = {
  archetypeId: string;
  numQuestions: number;
  chosen: boolean;
  selectionOrder: number;
  attempted: number;
  correct: number;
  timeSpentSec: number;
  verdict: Verdict;
};

function AddSetForm({
  archetypes,
  nextOrder,
  remaining,
  busy,
  onCancel,
  onSave,
}: {
  archetypes: Archetype[];
  nextOrder: number;
  remaining: number | null;
  busy: boolean;
  onCancel?: () => void;
  onSave: (draft: DraftSet) => void;
}) {
  const [archetypeId, setArchetypeId] = useState("");
  const [numQuestions, setNumQuestions] = useState(
    remaining !== null && remaining > 0 && remaining <= 6 ? remaining : 4,
  );
  const [opened, setOpened] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<"cleared" | "attempted_failed" | "abandoned_midway" | null>(null);
  const [wouldHaveCleared, setWouldHaveCleared] = useState<boolean | null>(null);
  const [attempted, setAttempted] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [timeSec, setTimeSec] = useState<number | null>(null);

  // Note: attempted may legitimately be 0 for an opened set. Abandoning a set
  // after six minutes without committing an answer is a real and common outcome
  // — it is design 1g's third card — and requiring at least one answer here
  // would make that unloggable.
  const chosenComplete = opened === true && outcome !== null && timeSec !== null;
  const skippedComplete = opened === false && wouldHaveCleared !== null && timeSec !== null;
  const canSave = archetypeId !== "" && numQuestions > 0 && (chosenComplete || skippedComplete) && !busy;

  function submit() {
    const verdict: Verdict = opened
      ? (outcome as Verdict)
      : wouldHaveCleared
        ? "skipped_would_have_cleared"
        : "skipped_correctly";
    onSave({
      archetypeId,
      numQuestions,
      chosen: opened === true,
      selectionOrder: nextOrder,
      attempted: opened ? attempted : 0,
      correct: opened ? correct : 0,
      timeSpentSec: timeSec ?? 0,
      verdict,
    });
  }

  const selected = archetypes.find((a) => a.id === archetypeId);

  return (
    <div className="rounded-[13px] border-[1.5px] border-brass bg-brass/[0.05] px-4 py-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-brass">
          NEW SET
        </span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="font-mono text-[10.5px] text-mute-400">
            CANCEL
          </button>
        )}
      </div>

      <FieldLabel>WHAT SHAPE WAS IT</FieldLabel>
      <select
        value={archetypeId}
        onChange={(e) => setArchetypeId(e.target.value)}
        className="w-full rounded-xl border border-ink/[0.13] bg-white px-3 py-3 text-[14px] font-medium text-ink focus:border-brass focus:outline-none"
      >
        <option value="">Pick the set shape…</option>
        {archetypes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {selected?.description && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
          {selected.description}
        </p>
      )}

      <FieldLabel>HOW MANY QUESTIONS</FieldLabel>
      <div className="flex gap-1.5">
        {[3, 4, 5, 6].map((n) => (
          <Chip key={n} on={numQuestions === n} onClick={() => setNumQuestions(n)}>
            {n}
          </Chip>
        ))}
      </div>

      <FieldLabel>DID YOU OPEN IT</FieldLabel>
      <div className="flex gap-1.5">
        <Chip on={opened === true} onClick={() => setOpened(true)}>
          I attempted it
        </Chip>
        <Chip on={opened === false} onClick={() => setOpened(false)}>
          Never touched it
        </Chip>
      </div>

      {opened === true && (
        <>
          <FieldLabel>HOW DID IT GO</FieldLabel>
          <div className="flex flex-col gap-1.5">
            <Chip on={outcome === "cleared"} onClick={() => setOutcome("cleared")}>
              Cleared it
            </Chip>
            <Chip on={outcome === "attempted_failed"} onClick={() => setOutcome("attempted_failed")}>
              Tried, didn&rsquo;t crack it
            </Chip>
            <Chip
              on={outcome === "abandoned_midway"}
              onClick={() => setOutcome("abandoned_midway")}
            >
              Started, then bailed
            </Chip>
          </div>

          <FieldLabel>ANSWERED / RIGHT</FieldLabel>
          <div className="flex items-center gap-2">
            <Counter
              value={attempted}
              max={numQuestions}
              onChange={(v) => {
                setAttempted(v);
                if (correct > v) setCorrect(v);
              }}
              label="answered"
            />
            <span className="font-mono text-sm text-mute-400">/</span>
            <Counter value={correct} max={attempted} onChange={setCorrect} label="right" />
          </div>

          <FieldLabel>ROUGHLY HOW LONG · YOUR ESTIMATE</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {OPENED_TIME_BUCKETS.map((b) => (
              <Chip key={b.sec} on={timeSec === b.sec} onClick={() => setTimeSec(b.sec)}>
                {b.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {opened === false && (
        <>
          <FieldLabel>NOW THAT YOU&rsquo;VE SEEN THE ANSWERS — COULD YOU HAVE CLEARED IT</FieldLabel>
          <div className="flex flex-col gap-1.5">
            <Chip on={wouldHaveCleared === true} onClick={() => setWouldHaveCleared(true)}>
              Yes, I&rsquo;d have cleared it
            </Chip>
            <Chip on={wouldHaveCleared === false} onClick={() => setWouldHaveCleared(false)}>
              No &mdash; right to skip
            </Chip>
          </div>

          <FieldLabel>TIME SPENT SCANNING IT</FieldLabel>
          <div className="flex gap-1.5">
            {SCAN_TIME_BUCKETS.map((b) => (
              <Chip key={b.sec} on={timeSec === b.sec} onClick={() => setTimeSec(b.sec)}>
                {b.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
            Scanning a set for ninety seconds and rejecting it costs ninety seconds whether or not
            marks follow. Recording it is what makes &ldquo;your scan is too slow&rdquo; detectable.
          </p>
        </>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={submit}
        className="mt-4 w-full rounded-xl bg-ink py-3.5 text-[14.5px] font-semibold text-paper transition-opacity disabled:opacity-40"
      >
        {busy ? "Saving…" : "Add this set"}
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[7px] mt-3.5 font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] px-3.5 py-2.5 text-[13px] ${
        on
          ? "bg-ink font-semibold text-white"
          : "border border-ink/[0.13] bg-white font-medium text-[#6B6659]"
      }`}
    >
      {children}
    </button>
  );
}

function Counter({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-between rounded-xl border border-ink/[0.13] bg-white px-2 py-1.5">
      <button
        type="button"
        aria-label={`one fewer ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="px-2 py-1 font-mono text-base text-[#6B6659]"
      >
        −
      </button>
      <span className="tnum font-mono text-[15px] font-semibold text-ink">{value}</span>
      <button
        type="button"
        aria-label={`one more ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="px-2 py-1 font-mono text-base text-[#6B6659]"
      >
        +
      </button>
    </div>
  );
}

function ordinal(n: number | null): string {
  if (n === null) return "—";
  const suffix = n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH";
  return `${n}${suffix}`;
}
