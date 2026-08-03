"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DueTopic } from "@/lib/analytics/revision";

/**
 * The revision queue — v2's one feature.
 *
 * WORDING IS THE HONESTY CONSTRAINT HERE, as it is in facts.ts. The queue is
 * built from the student's OWN `error_cause` tags, so it may say "you marked this
 * a concept gap" and must never say "you are weak at this". One is remembering
 * what they told us; the other is a claim about their ability that a single
 * self-tagged error cannot support.
 *
 * No quiz, deliberately. Promotion is the student saying they revised; demotion
 * comes from a real concept error on a later mock, which is stronger evidence
 * than any self-administered test — and it needs no practice content, which is
 * what keeps v2 clear of the copyright constraint entirely.
 */

const BOX_LABEL = ["1st pass", "2nd pass", "3rd pass", "4th pass", "settled"];

export default function RevisionQueue({
  due,
  deferred,
  totalTracked,
}: {
  due: DueTopic[];
  deferred: number;
  totalTracked: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(questionTypeId: string, action: "revised" | "remove") {
    setError(null);
    setBusy(questionTypeId);
    try {
      const res = await fetch("/api/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, questionTypeId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not update your queue");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your queue");
    } finally {
      setBusy(null);
    }
  }

  // Nothing tracked at all: say why rather than showing an empty box.
  if (totalTracked === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-ink/20 px-4 py-3.5">
        <div className="text-[13px] font-semibold text-[#6B6659]">Nothing to revise yet</div>
        <p className="mt-1 text-[12px] leading-relaxed text-mute-400 text-pretty">
          Topics land here when you tag a wrong answer as a <strong>concept gap</strong> while
          logging. Misreads and careless slips don&rsquo;t &mdash; those aren&rsquo;t things revision
          fixes.
        </p>
      </div>
    );
  }

  // Tracked, but nothing due. An empty day is a good outcome, not a gap.
  if (due.length === 0) {
    return (
      <div className="rounded-[14px] border border-cleared/40 bg-cleared/[0.06] px-4 py-3.5">
        <div className="text-[13.5px] font-semibold text-ink">Nothing due today.</div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6B6659] text-pretty">
          {totalTracked} {totalTracked === 1 ? "topic is" : "topics are"} on the schedule and none
          has come round yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {due.map((topic) => (
        <div
          key={topic.questionTypeId}
          className="rounded-[13px] border border-ink/[0.12] bg-white px-4 py-3.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14.5px] font-semibold text-ink">{topic.typeName}</span>
            <span className="shrink-0 font-mono text-[10px] font-medium tracking-[0.08em] text-mute-400">
              {BOX_LABEL[topic.box - 1] ?? `PASS ${topic.box}`}
            </span>
          </div>

          <p className="mt-1 text-[12px] leading-relaxed text-[#6B6659]">
            {topic.overdueDays === 0
              ? "Due today."
              : `Due ${topic.overdueDays} ${topic.overdueDays === 1 ? "day" : "days"} ago.`}{" "}
            You marked a concept gap here.
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act(topic.questionTypeId, "revised")}
              className="flex-1 rounded-[10px] bg-ink py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-paper disabled:opacity-40"
            >
              {busy === topic.questionTypeId ? "SAVING…" : "REVISED IT"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act(topic.questionTypeId, "remove")}
              className="rounded-[10px] border border-ink/[0.15] px-3.5 py-2.5 font-mono text-[11px] font-medium text-mute-400 disabled:opacity-40"
            >
              DROP
            </button>
          </div>
        </div>
      ))}

      {/* What the cap is holding back. Truncating silently would read as
          "that's all there is". */}
      {deferred > 0 && (
        <p className="px-1 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
          {deferred} more {deferred === 1 ? "topic is" : "topics are"} overdue, held back for
          tomorrow. A list of everything at once is a list nobody works through.
        </p>
      )}

      {error && <p className="px-1 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
