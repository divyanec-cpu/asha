"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Design screen 2b. Four fields: name, target exam + year, prep mode, and an
 * optional target percentile.
 *
 * The percentile field carries the design's own caption — "we won't predict it,
 * only track it". That is not decoration: CLAUDE.md rule 4 forbids ASHA from
 * computing or implying a percentile, so the one place a percentile is typed in
 * is exactly where that promise has to be visible.
 */

export type ExamOption = {
  code: string;
  active: boolean;
  years: number[];
};

/**
 * The design labels the first prep mode "Coaching"; the column accepts
 * 'classroom'. Display label → stored value.
 */
const PREP_MODES = [
  { label: "Coaching", value: "classroom" },
  { label: "Online", value: "online" },
  { label: "Self-study", value: "self-study" },
] as const;

export default function ProfileForm({ examOptions }: { examOptions: ExamOption[] }) {
  const router = useRouter();

  const active = examOptions.filter((e) => e.active);
  const inactive = examOptions.filter((e) => !e.active);
  const firstActive = active[0];

  const [name, setName] = useState("");
  const [examCode, setExamCode] = useState(firstActive?.code ?? "");
  const [year, setYear] = useState<number | null>(
    firstActive?.years.at(-1) ?? null,
  );
  const [prepMode, setPrepMode] = useState<string | null>(null);
  const [percentile, setPercentile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedExam = examOptions.find((e) => e.code === examCode);
  const canSubmit = name.trim().length > 0 && examCode !== "" && year !== null && !busy;

  async function save() {
    setError(null);

    const parsedPercentile = percentile.trim() === "" ? null : Number(percentile);
    if (parsedPercentile !== null) {
      if (!Number.isFinite(parsedPercentile) || parsedPercentile <= 0 || parsedPercentile > 100) {
        setError("A target percentile has to be between 0 and 100.");
        return;
      }
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      // The row's id IS the auth user id, and RLS requires auth.uid() = id, so a
      // user can only ever create their own profile.
      const { error: insertError } = await supabase.from("users").insert({
        id: user.id,
        name: name.trim(),
        target_exam: examCode,
        target_year: year,
        target_percentile: parsedPercentile,
        prep_mode: prepMode,
      });
      if (insertError) throw new Error(insertError.message);

      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper px-6 pt-2">
      {/* Progress: phone done, code done, profile in progress. */}
      <div className="mb-6 flex gap-1.5">
        <span className="h-[3px] flex-1 rounded-sm bg-brass" />
        <span className="h-[3px] flex-1 rounded-sm bg-brass" />
        <span className="h-[3px] flex-1 rounded-sm bg-ink/[0.13]" />
      </div>

      <h1 className="text-[25px] font-semibold leading-tight text-ink">
        Four things, then we&rsquo;re done.
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B6659]">
        None of this is shared, ranked, or shown to anyone else.
      </p>

      <div className="mt-7 flex flex-col gap-5">
        {/* Name */}
        <div>
          <Label>WHAT SHOULD WE CALL YOU</Label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            placeholder="Arjun R."
            className="w-full rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 text-[15px] font-medium text-ink placeholder:text-mute-400 focus:border-brass focus:outline-none"
          />
        </div>

        {/* Target exam */}
        <div>
          <Label>TARGET EXAM</Label>
          <div className="flex gap-1.5">
            {active.map((exam) =>
              exam.years.map((y) => {
                const on = exam.code === examCode && y === year;
                return (
                  <button
                    key={`${exam.code}-${y}`}
                    type="button"
                    onClick={() => {
                      setExamCode(exam.code);
                      setYear(y);
                    }}
                    className={`flex-1 rounded-[11px] py-3 text-sm ${
                      on
                        ? "bg-ink font-semibold text-white"
                        : "border border-ink/[0.13] bg-white font-medium text-[#6B6659]"
                    }`}
                  >
                    {exam.code} {y}
                  </button>
                );
              }),
            )}
            {inactive.map((exam) => (
              <div
                key={exam.code}
                className="flex-1 rounded-[11px] border border-dashed border-ink/[0.18] bg-white py-3 text-center text-sm font-medium text-mute-400"
                title="Not available yet"
              >
                {exam.code} &mdash; soon
              </div>
            ))}
          </div>
          {selectedExam && selectedExam.years.length === 0 && (
            <p className="mt-2 text-[12px] text-bad">
              No exam pattern is configured for {selectedExam.code} yet.
            </p>
          )}
        </div>

        {/* Prep mode */}
        <div>
          <Label>HOW ARE YOU PREPARING</Label>
          <div className="flex gap-1.5">
            {PREP_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setPrepMode(mode.value === prepMode ? null : mode.value)}
                className={`flex-1 rounded-[11px] py-3 text-[13.5px] ${
                  prepMode === mode.value
                    ? "bg-ink font-semibold text-white"
                    : "border border-ink/[0.13] bg-white font-medium text-[#6B6659]"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target percentile */}
        <div>
          <div className="mb-[7px] flex items-baseline justify-between">
            <Label className="mb-0">TARGET PERCENTILE</Label>
            <span className="font-mono text-[10px] font-medium text-mute-400">OPTIONAL</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 focus-within:border-brass">
            <input
              type="text"
              inputMode="decimal"
              value={percentile}
              onChange={(e) => setPercentile(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
              placeholder="99.0"
              className="tnum w-20 bg-transparent font-mono text-[15px] font-semibold text-ink placeholder:text-mute-400 focus:outline-none"
            />
            <span className="text-right text-[12px] text-mute-400">
              we won&rsquo;t predict it, only track it
            </span>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-[12.5px] text-bad">{error}</p>}

      <div className="mt-auto pb-6 pt-6">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void save()}
          className="w-full rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Saving…" : "Log my first mock"}
        </button>
      </div>
    </main>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mb-[7px] font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500 ${className}`}
    >
      {children}
    </div>
  );
}
