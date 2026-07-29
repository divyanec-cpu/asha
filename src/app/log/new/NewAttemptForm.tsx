"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Attempt creation. Deliberately short — this screen is pure overhead against
 * the sub-ten-minute logging target, so it asks only for what cannot be derived.
 *
 * Section scores ARE asked for, even though ASHA could add up the rows the
 * student is about to log. The reason is the cross-check: comparing the two
 * catches a forgotten or mis-tagged set, and a forgotten set is invisible
 * otherwise. Skipped sets are the whole basis of the set-selection engine, so a
 * silently missing one is the most damaging error available here.
 */

type Section = { id: string; code: string; name: string; questionCount: number | null };

const PROVIDERS = ["SimCAT", "AIMCAT", "iCAT", "PYQ", "Other"] as const;

export default function NewAttemptForm({
  examId,
  examConfigId,
  sections,
}: {
  examId: string;
  examCode: string;
  examConfigId: string;
  totalQuestions: number;
  sections: Section[];
}) {
  const router = useRouter();

  const [provider, setProvider] = useState<string>(PROVIDERS[0]);
  const [title, setTitle] = useState("");
  const [takenOn, setTakenOn] = useState(todayIso());
  const [totalScore, setTotalScore] = useState("");
  const [percentile, setPercentile] = useState("");
  const [sectionScores, setSectionScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim() !== "" && takenOn !== "" && !busy;

  async function create() {
    setError(null);

    const parsedTotal = totalScore.trim() === "" ? null : Number(totalScore);
    const parsedPct = percentile.trim() === "" ? null : Number(percentile);
    if (parsedPct !== null && (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 100)) {
      setError("A reported percentile has to be between 0 and 100.");
      return;
    }
    if (parsedTotal !== null && !Number.isFinite(parsedTotal)) {
      setError("That total score isn't a number.");
      return;
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

      // Three inserts, not one transaction. An orphaned mock_sources row costs
      // nothing (it is metadata only) so the simpler code wins; if this ever
      // needs to be atomic it becomes one RPC.
      const { data: source, error: sourceError } = await supabase
        .from("mock_sources")
        .insert({
          user_id: user.id,
          provider,
          title: title.trim(),
          is_official_pyq: provider === "PYQ",
        })
        .select("id")
        .single();
      if (sourceError) throw new Error(sourceError.message);

      const { data: attempt, error: attemptError } = await supabase
        .from("mock_attempts")
        .insert({
          user_id: user.id,
          exam_id: examId,
          exam_config_id: examConfigId,
          source_id: source.id,
          taken_on: takenOn,
          // v1 has no in-app timer, so every attempt's timing is the student's
          // recollection. Written explicitly rather than relying on the column
          // default, so the honest-data rule is visible at the call site.
          timing_source: "estimated",
          entry_mode: "post_hoc_log",
          total_score: parsedTotal,
          percentile_reported: parsedPct,
          is_complete: false,
        })
        .select("id")
        .single();
      if (attemptError) throw new Error(attemptError.message);

      // One section_attempt per section, carrying the reported score. Created up
      // front because the sections are known from config and the scores are on
      // screen now; the per-section entry screens fill in the detail.
      const rows = sections.map((s) => {
        const raw = sectionScores[s.id]?.trim() ?? "";
        return {
          mock_attempt_id: attempt.id,
          section_id: s.id,
          score: raw === "" ? null : Number(raw),
        };
      });
      const bad = rows.find((r) => r.score !== null && !Number.isFinite(r.score));
      if (bad) throw new Error("One of the section scores isn't a number.");

      const { error: sectionError } = await supabase.from("section_attempts").insert(rows);
      if (sectionError) throw new Error(sectionError.message);

      router.replace(`/log/${attempt.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the attempt");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="bg-ink px-6 pb-4 pt-2">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          LOG A MOCK
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          Read the numbers off your result page. Everything else comes next.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-5 pt-4">
        <div>
          <Label>WHERE FROM</Label>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`rounded-[10px] px-3.5 py-2.5 text-[13px] ${
                  provider === p
                    ? "bg-ink font-semibold text-white"
                    : "border border-ink/[0.13] bg-white font-medium text-[#6B6659]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>WHICH ONE</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="SimCAT 12"
            className="w-full rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 text-[15px] font-medium text-ink placeholder:text-mute-400 focus:border-brass focus:outline-none"
          />
        </div>

        <div>
          <Label>WHEN YOU TOOK IT</Label>
          <input
            type="date"
            value={takenOn}
            max={todayIso()}
            onChange={(e) => setTakenOn(e.target.value)}
            className="tnum w-full rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 font-mono text-[15px] font-medium text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <Label>TOTAL SCORE</Label>
            <input
              inputMode="decimal"
              value={totalScore}
              onChange={(e) => setTotalScore(e.target.value.replace(/[^\d.-]/g, ""))}
              placeholder="118"
              className="tnum w-full rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 font-mono text-[15px] font-semibold text-ink placeholder:text-mute-400 focus:border-brass focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <Label>PERCENTILE</Label>
            <input
              inputMode="decimal"
              value={percentile}
              onChange={(e) => setPercentile(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="91.4"
              className="tnum w-full rounded-xl border border-ink/[0.13] bg-white px-4 py-3.5 font-mono text-[15px] font-semibold text-ink placeholder:text-mute-400 focus:border-brass focus:outline-none"
            />
          </div>
        </div>
        <p className="-mt-3 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
          Percentile is whatever your mock platform told you. ASHA records it and never computes or
          predicts one.
        </p>

        <div>
          <Label>SECTION SCORES</Label>
          <div className="flex gap-2.5">
            {sections.map((s) => (
              <div key={s.id} className="flex-1">
                <input
                  inputMode="decimal"
                  value={sectionScores[s.id] ?? ""}
                  onChange={(e) =>
                    setSectionScores((prev) => ({
                      ...prev,
                      [s.id]: e.target.value.replace(/[^\d.-]/g, ""),
                    }))
                  }
                  placeholder="—"
                  aria-label={`${s.code} score`}
                  className="tnum w-full rounded-xl border border-ink/[0.13] bg-white px-3 py-3 text-center font-mono text-[15px] font-semibold text-ink placeholder:text-mute-400 focus:border-brass focus:outline-none"
                />
                <div className="mt-1.5 text-center font-mono text-[10px] font-medium tracking-[0.1em] text-mute-500">
                  {s.code}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
            Used to cross-check what you log. If the sets and questions you enter don&rsquo;t add up
            to these, ASHA will say so &mdash; that usually means a set got missed.
          </p>
        </div>

        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        <div className="mt-auto pb-6 pt-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void create()}
            className="w-full rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Creating…" : "Start with DILR"}
          </button>
          <p className="mt-3 text-center text-[11.5px] text-mute-400">
            You can stop halfway and come back to it.
          </p>
        </div>
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[7px] font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
      {children}
    </div>
  );
}

/** Local calendar date, not UTC — taken_on is a date, and a UTC shift can put an
 *  evening mock on the wrong day. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
