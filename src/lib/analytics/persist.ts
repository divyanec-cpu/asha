import "server-only";

import { createServerSupabaseClient } from "../supabase/server";
import { QUESTION_BUCKET_SECONDS } from "../timeBuckets";
import type { InsightKind, ConfidenceLabel } from "../thresholds";
import { loadAnalyticsData } from "./load";
import { setSelectionPlaybook, skipRegret } from "./setSelection";
import { calibration, errorCauses, quadrant, timeTraps } from "./questions";
import { pacing } from "./trend";
import {
  calibrationHeadline,
  calibrationRationale,
  errorCauseHeadline,
  errorCauseRationale,
  pacingHeadline,
  pacingRationale,
  quadrantHeadline,
  quadrantRationale,
  setSelectionHeadline,
  setSelectionRationale,
  skipRegretHeadline,
  skipRegretRationale,
  timeTrapHeadline,
  timeTrapRationale,
} from "./headlines";

/**
 * Recomputes every insight for the signed-in user and persists the LIVE ones —
 * the below-threshold ones are never written, matching positioning rule 3: an
 * insight below the evidence threshold is not shown, and that includes not
 * being shown to the database either. A locked card has nothing to store.
 *
 * This does NOT drive any screen. Home, playbook and trends compute claims live
 * against current rows every time they render (lib/analytics/load.ts), which is
 * strictly fresher than anything cached here. This table exists only to track
 * `acted_on` — the v1 → v2 gate metric ("a real user has logged ≥5 mocks and
 * returned to the set-selection view before their next mock") — which needs a
 * durable record across visits, not a live recomputation.
 *
 * CARRY-FORWARD, the rule already on record in decisions.md: recompute must not
 * reset `acted_on` / `dismissed`, or a dismissed insight would silently
 * reappear and the gate metric would read as never met. Matching key is
 * (kind, target_type_id, target_section_id) — see migration 0007 for why the
 * section column had to be added before this could be written correctly: two
 * different sections' error_cause or pacing rows would otherwise both carry
 * target_type_id = null and be indistinguishable.
 *
 * Called after an attempt is marked complete (architecture.md: "Insight
 * recomputation runs on attempt completion... over that user's full history").
 */
export async function recomputeInsights(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const data = await loadAnalyticsData();
  if (!data || data.mocks.length === 0) return { ok: true, count: 0 };

  const { data: sectionRows } = await supabase.from("sections").select("id, code");
  const sectionIdOf = new Map((sectionRows ?? []).map((s) => [s.code as string, s.id as string]));

  type Row = {
    kind: InsightKind;
    target_type_id: string | null;
    target_section_id: string | null;
    headline: string;
    rationale: string;
    supporting_n: number;
    confidence_label: ConfidenceLabel;
  };

  const rows: Row[] = [];

  for (const c of setSelectionPlaybook(data.sets)) {
    if (c.status !== "ok") continue;
    rows.push({
      kind: "set_selection",
      target_type_id: c.data.archetypeId,
      target_section_id: null,
      headline: setSelectionHeadline(c.data),
      rationale: setSelectionRationale(c.data),
      supporting_n: c.supportingN,
      confidence_label: c.confidence,
    });
  }

  const regret = skipRegret(data.sets);
  if (regret.status === "ok") {
    rows.push({
      kind: "skip_regret",
      target_type_id: null,
      target_section_id: null,
      headline: skipRegretHeadline(regret.data),
      rationale: skipRegretRationale(regret.data),
      supporting_n: regret.supportingN,
      confidence_label: regret.confidence,
    });
  }

  const cal = calibration(data.questions, data.scheme);
  if (cal.status === "ok") {
    rows.push({
      kind: "calibration",
      target_type_id: null,
      target_section_id: null,
      headline: calibrationHeadline(cal.data),
      rationale: calibrationRationale(cal.data),
      supporting_n: cal.supportingN,
      confidence_label: cal.confidence,
    });
  }

  for (const c of errorCauses(data.questions)) {
    if (c.status !== "ok") continue;
    rows.push({
      kind: "error_cause",
      target_type_id: null,
      target_section_id: sectionIdOf.get(c.data.sectionCode) ?? null,
      headline: errorCauseHeadline(c.data),
      rationale: errorCauseRationale(c.data),
      supporting_n: c.supportingN,
      confidence_label: c.confidence,
    });
  }

  for (const c of quadrant(data.questions)) {
    if (c.status !== "ok") continue;
    rows.push({
      kind: "quadrant",
      target_type_id: c.data.typeId,
      target_section_id: null,
      headline: quadrantHeadline(c.data),
      rationale: quadrantRationale(c.data),
      supporting_n: c.supportingN,
      confidence_label: c.confidence,
    });
  }

  for (const c of timeTraps(data.questions, QUESTION_BUCKET_SECONDS)) {
    if (c.status !== "ok") continue;
    rows.push({
      kind: "time_trap",
      target_type_id: c.data.typeId,
      target_section_id: null,
      headline: timeTrapHeadline(c.data),
      rationale: timeTrapRationale(c.data),
      supporting_n: c.supportingN,
      confidence_label: c.confidence,
    });
  }

  for (const c of pacing(data.sections)) {
    if (c.status !== "ok") continue;
    rows.push({
      kind: "pacing",
      target_type_id: null,
      target_section_id: sectionIdOf.get(c.data.sectionCode) ?? null,
      headline: pacingHeadline(c.data),
      rationale: pacingRationale(c.data),
      supporting_n: c.supportingN,
      confidence_label: c.confidence,
    });
  }

  if (rows.length === 0) return { ok: true, count: 0 };

  // Fetch prior rows to carry acted_on/dismissed forward. Only the MOST RECENT
  // row per key matters — if a key appears in two old batches (it shouldn't,
  // but recompute is not transactional against concurrent calls), the first one
  // encountered wins, and rows arrive newest-first.
  const { data: existing } = await supabase
    .from("insights")
    .select("kind, target_type_id, target_section_id, generated_at, acted_on, dismissed")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false });

  const key = (k: string, typeId: string | null, sectionId: string | null) =>
    `${k}|${typeId ?? ""}|${sectionId ?? ""}`;

  const priorByKey = new Map<string, { acted_on: boolean; dismissed: boolean }>();
  for (const row of existing ?? []) {
    const k = key(row.kind, row.target_type_id, row.target_section_id);
    if (!priorByKey.has(k)) {
      priorByKey.set(k, { acted_on: row.acted_on, dismissed: row.dismissed });
    }
  }

  // One timestamp for the whole batch: these rows are one recompute, not a
  // trickle, and giving them a shared generated_at is what makes "the current
  // set of insights" a well-defined query (most recent generated_at per user).
  const generatedAt = new Date().toISOString();

  const toInsert = rows.map((r) => {
    const prior = priorByKey.get(key(r.kind, r.target_type_id, r.target_section_id));
    return {
      user_id: user.id,
      generated_at: generatedAt,
      kind: r.kind,
      target_type_id: r.target_type_id,
      target_section_id: r.target_section_id,
      headline: r.headline,
      rationale: r.rationale,
      supporting_n: r.supporting_n,
      confidence_label: r.confidence_label,
      acted_on: prior?.acted_on ?? false,
      dismissed: prior?.dismissed ?? false,
    };
  });

  const { error } = await supabase.from("insights").insert(toInsert);
  if (error) return { ok: false, error: error.message };

  return { ok: true, count: toInsert.length };
}
