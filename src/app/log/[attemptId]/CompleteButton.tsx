"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Marks the attempt logged, then recomputes the insight ledger.
 *
 * architecture.md: "Insight recomputation runs on attempt completion, over that
 * user's full history — not incrementally." The recompute carries `acted_on` and
 * `dismissed` forward, so a dismissed insight does not reappear.
 *
 * The recompute is deliberately NOT allowed to fail the completion. The attempt
 * is already saved by the time it runs, and the insight screens compute their
 * claims live from attempt rows rather than reading this table — so a failed
 * recompute costs an `acted_on` ledger entry, not the student's work. Blocking
 * or rolling back the completion over it would be a far worse outcome than a
 * stale ledger row.
 *
 * Reopening an attempt recomputes too: removing a mock from the completed set
 * changes every average, and leaving the ledger describing data that no longer
 * counts would be exactly the stale-derived-state bug the full-recompute design
 * exists to avoid.
 *
 * Deliberately still enabled when sections are incomplete: the student may
 * genuinely not want to log every section, and refusing to let them finish would
 * leave the attempt permanently "in progress". It just says what is missing
 * first.
 */
export default function CompleteButton({
  attemptId,
  allComplete,
  isComplete,
}: {
  attemptId: string;
  allComplete: boolean;
  isComplete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mark(complete: boolean) {
    setError(null);
    setBusy(true);
    const { error: updateError } = await supabase
      .from("mock_attempts")
      .update({ is_complete: complete })
      .eq("id", attemptId);
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    // Fire and forget by design — see the note above on why this must not fail
    // the completion. Logged rather than surfaced: there is nothing useful the
    // student could do about it, and the screens don't depend on it.
    try {
      const res = await fetch("/api/insights/recompute", { method: "POST" });
      if (!res.ok) {
        console.error("[insights] recompute failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("[insights] recompute request failed:", e);
    }

    router.push("/log");
    router.refresh();
  }

  if (isComplete) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-[13px] border border-cleared/40 bg-cleared/[0.07] px-4 py-3.5">
          <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-cleared">
            LOGGED
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink text-pretty">
            This mock is counted. Nothing is locked &mdash; reopen any section to correct it.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void mark(false)}
          className="font-mono text-[11px] text-mute-400 underline"
        >
          REOPEN THIS ATTEMPT
        </button>
        {error && <p className="text-[12.5px] text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!allComplete && (
        <p className="text-[11.5px] leading-relaxed text-mute-400 text-pretty">
          Some sections aren&rsquo;t fully logged. You can finish anyway &mdash; ASHA will just have
          less to work with, and will say so rather than guessing.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void mark(true)}
        className="w-full rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {busy ? "Saving…" : allComplete ? "Done — count this mock" : "Finish anyway"}
      </button>
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
