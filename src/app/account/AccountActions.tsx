"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildCsvExport,
  buildJsonExport,
  downloadFile,
  exportFilename,
} from "@/lib/export";
import { supabase } from "@/lib/supabase/client";

/**
 * Export and delete.
 *
 * These are the two things CLAUDE.md insists work from day one rather than being
 * a compliance afterthought, and the design puts them on this screen on purpose:
 * "Export and delete sit right here, not buried in settings."
 *
 * Delete requires typing the word, which the design doesn't show. Added because
 * the action is genuinely irreversible and a single mis-tap would destroy a
 * season's logging — the one thing in this product that cannot be re-created.
 */
export default function AccountActions({ mockCount }: { mockCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "json" | "csv" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  async function doExport(kind: "json" | "csv") {
    setError(null);
    setBusy(kind);
    try {
      const contents = kind === "json" ? await buildJsonExport() : await buildCsvExport();
      downloadFile(
        contents,
        exportFilename(kind),
        kind === "json" ? "application/json" : "text/csv",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build your export");
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    setError(null);
    setBusy("delete");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not delete your account");
      // Clear the local session too, or the browser keeps a cookie pointing at a
      // user that no longer exists.
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ── Export ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-paper/[0.07] px-4 py-3.5">
        <div className="text-[13.5px] font-semibold text-paper">Export everything</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-mute-500 text-pretty">
          {/* "all 1 mock" reads badly, so singular gets its own phrasing. */}
          {mockCount === 0
            ? "Nothing logged yet, but the export works regardless."
            : mockCount === 1
              ? "One file, your first mock, yours to keep."
              : `One file, all ${mockCount} mocks, yours to keep.`}
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void doExport("csv")}
            className="flex-1 rounded-[10px] border border-brass/50 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-brass disabled:opacity-40"
          >
            {busy === "csv" ? "BUILDING…" : "CSV"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void doExport("json")}
            className="flex-1 rounded-[10px] border border-paper/25 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-paper disabled:opacity-40"
          >
            {busy === "json" ? "BUILDING…" : "JSON"}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#6B6659] text-pretty">
          CSV opens in a spreadsheet — one row per question and per set. JSON is the complete
          record, every field ASHA stores.
        </p>
      </div>

      {/* ── Delete ─────────────────────────────────────────────────────────── */}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center justify-between rounded-xl border border-bad/35 px-4 py-3.5 text-left"
        >
          <div>
            <div className="text-[13.5px] font-semibold text-bad-soft">Delete my account</div>
            <div className="mt-0.5 text-[11.5px] text-mute-500">
              Permanent, and it actually deletes.
            </div>
          </div>
          <span className="font-mono text-xs text-bad">→</span>
        </button>
      ) : (
        <div className="rounded-xl border border-bad/45 bg-bad/[0.08] px-4 py-3.5">
          <div className="text-[13.5px] font-semibold text-bad-soft">
            This removes everything, immediately.
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute-300 text-pretty">
            Your profile, every mock, every set and every question you&rsquo;ve logged
            {mockCount > 0 && ` — all ${mockCount} ${mockCount === 1 ? "mock" : "mocks"}`}. There is
            no undo and we keep no copy. Export first if you might want it.
          </p>
          <label className="mt-3 block">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
              TYPE DELETE TO CONFIRM
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-[10px] border border-paper/25 bg-transparent px-3 py-2.5 font-mono text-[14px] font-semibold tracking-[0.1em] text-paper focus:border-bad focus:outline-none"
            />
          </label>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError(null);
              }}
              className="flex-1 rounded-[10px] border border-paper/25 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-paper disabled:opacity-40"
            >
              KEEP IT
            </button>
            <button
              type="button"
              disabled={typed.trim().toUpperCase() !== "DELETE" || busy !== null}
              onClick={() => void doDelete()}
              className="flex-1 rounded-[10px] bg-bad py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-white disabled:opacity-30"
            >
              {busy === "delete" ? "DELETING…" : "DELETE FOREVER"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] leading-relaxed text-bad-soft text-pretty">{error}</p>}
    </div>
  );
}
