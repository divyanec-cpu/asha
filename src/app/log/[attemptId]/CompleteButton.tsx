"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Marks the attempt logged.
 *
 * Insight recomputation hangs off this in Phase 5 — architecture.md specifies a
 * full recompute over the user's history on attempt completion, carrying
 * `acted_on` and `dismissed` forward. Nothing computes insights yet, so this
 * only flips the flag.
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
