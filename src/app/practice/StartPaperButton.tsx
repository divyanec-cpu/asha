"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Starts a paper: creates the attempt server-side, then hands off to the runner.
 *
 * The creation is a POST rather than a link because it writes rows, and a
 * GET that mutates would let a prefetch or a back-button start a timed attempt the
 * student never asked for.
 */
export default function StartPaperButton({
  paperId,
  title,
}: {
  paperId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not start this paper.");
        setBusy(false);
        return;
      }
      router.push(`/practice/run/${body.sectionAttemptId}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full rounded-[10px] bg-ink py-3 font-mono text-[11.5px] font-semibold tracking-[0.06em] text-paper disabled:opacity-50"
      >
        {busy ? "STARTING…" : `START ${title.toUpperCase()}`}
      </button>
      {error && <p className="mt-2 text-[12.5px] leading-relaxed text-bad">{error}</p>}
    </div>
  );
}
