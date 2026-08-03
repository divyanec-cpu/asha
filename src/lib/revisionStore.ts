import "server-only";

import {
  BOX_INTERVAL_DAYS,
  addDays,
  reconcileQueue,
  revisionCandidates,
  type QueueRow,
} from "./analytics/revision";
import { loadAnalyticsData } from "./analytics/load";
import { createServerSupabaseClient } from "./supabase/server";

/**
 * Reads and reconciles `revision_queue`.
 *
 * All writes go through the cookie-based server client, so RLS scopes every
 * statement to the caller. No service-role client is involved: unlike the auth
 * bootstrap, nothing here needs to bypass ownership.
 */

/** Local calendar date. Due dates are dates, not instants. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type StoredTopic = QueueRow & { typeName: string };

export async function loadQueue(): Promise<StoredTopic[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("revision_queue")
    .select("question_type_id, box, due_date, question_types(name)")
    .order("due_date");

  if (error) {
    console.error("[revision] loadQueue failed:", error.message);
    return [];
  }

  return (data ?? []).map((r) => {
    // The embedded relation is typed as an array without generated DB types,
    // though PostgREST returns an object for a to-one FK. Same reason
    // lib/supabase/relations.ts exists.
    const embedded = r.question_types as unknown;
    const named = Array.isArray(embedded) ? embedded[0] : embedded;
    return {
      questionTypeId: r.question_type_id as string,
      box: r.box as number,
      dueDate: r.due_date as string,
      typeName: (named as { name?: string } | null)?.name ?? "Unknown type",
    };
  });
}

/**
 * Rebuilds the queue from the student's tagged concept gaps.
 *
 * Called on attempt completion, alongside the insight recompute.
 *
 * WHICH MOCKS COUNT AS ALREADY APPLIED. `reconcileQueue` needs to know which
 * mocks' errors have already moved the queue, or every recompute would re-demote
 * on the same historical error and no topic could ever climb past box 1. There is
 * no separate ledger for that, so the rule is derived: a mock counts as applied
 * if it is not the most recently taken one. That is exact for the normal path —
 * complete a mock, reconcile once — and the failure mode if a recompute is missed
 * is a topic demoted one cycle late, which is recoverable and invisible. A
 * dedicated `applied_mock_ids` column would be more precise and is not worth a
 * migration for that.
 */
export async function reconcileRevisionQueue(): Promise<{ inserted: number; demoted: number }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { inserted: 0, demoted: 0 };

  const data = await loadAnalyticsData();
  if (!data) return { inserted: 0, demoted: 0 };

  const { mocks, questions } = data;
  if (mocks.length === 0) return { inserted: 0, demoted: 0 };

  const latestMockId = mocks[mocks.length - 1].id;
  const countedMockIds = new Set(mocks.slice(0, -1).map((m) => m.id));

  const candidates = revisionCandidates(questions);
  const existing = await loadQueue();
  const today = todayIso();

  const decisions = reconcileQueue({ candidates, existing, today, countedMockIds });

  let inserted = 0;
  let demoted = 0;

  for (const decision of decisions) {
    if (decision.action === "insert") {
      const { error } = await supabase.from("revision_queue").insert({
        user_id: user.id,
        question_type_id: decision.questionTypeId,
        box: decision.box,
        due_date: decision.dueDate,
      });
      if (error) console.error("[revision] insert failed:", error.message);
      else inserted++;
    } else if (decision.action === "demote") {
      const { error } = await supabase
        .from("revision_queue")
        .update({ box: decision.box, due_date: decision.dueDate, updated_at: new Date().toISOString() })
        .eq("question_type_id", decision.questionTypeId);
      if (error) console.error("[revision] demote failed:", error.message);
      else demoted++;
    }
  }

  // Referenced so the derivation above is legible at the call site rather than
  // only in the comment.
  void latestMockId;

  return { inserted, demoted };
}

/** Marks a topic revised: up a box, scheduled by the new interval. */
export async function markRevised(questionTypeId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: row, error: readError } = await supabase
    .from("revision_queue")
    .select("box")
    .eq("question_type_id", questionTypeId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!row) return { ok: false, error: "That topic isn't in your queue." };

  const box = Math.min(BOX_INTERVAL_DAYS.length, (row.box as number) + 1);
  const dueDate = addDays(todayIso(), BOX_INTERVAL_DAYS[box - 1]);

  const { error } = await supabase
    .from("revision_queue")
    .update({ box, due_date: dueDate, updated_at: new Date().toISOString() })
    .eq("question_type_id", questionTypeId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Removes a topic from the queue.
 *
 * Exists because reconciliation deliberately never deletes: a topic revised and
 * never missed again keeps climbing its boxes, and dropping it silently would
 * defeat spaced repetition. Retiring a topic is the student's own call, so it
 * needs an explicit action.
 */
export async function removeTopic(questionTypeId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("revision_queue")
    .delete()
    .eq("question_type_id", questionTypeId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
