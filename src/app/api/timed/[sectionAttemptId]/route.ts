import { NextRequest, NextResponse } from "next/server";
import { rollUpTimingSource, type TimingSource } from "@/lib/analytics/provenance";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Saves a timed run: measured per-question timings, the order actually worked in,
 * and confidence declared in the moment.
 *
 * WHAT IT PRESERVES. A timed run happens before the answer key is available, so
 * this writes timing/order/status/confidence and leaves `is_correct` and
 * `error_cause` null for the review pass to fill. Where a question row already
 * exists (the student reviewed first, then re-ran it timed) the existing
 * correctness is KEPT — losing a marked-up review because someone re-timed the
 * section would be the worst possible trade.
 *
 * Ownership comes from RLS via the cookie client; a sectionAttemptId belonging to
 * someone else simply matches no rows.
 */

type IncomingRow = {
  questionNumber: number;
  timeSpentSec: number;
  orderIndex: number | null;
  status: "attempted" | "skipped";
  confidence: number | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sectionAttemptId: string }> },
) {
  const { sectionAttemptId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request" }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No timings to save" }, { status: 400 });
  }
  const rows = body.rows as IncomingRow[];

  // Confirm the section belongs to the caller, and get its attempt.
  const { data: sectionAttempt, error: saError } = await supabase
    .from("section_attempts")
    .select("id, mock_attempt_id, section_id")
    .eq("id", sectionAttemptId)
    .maybeSingle();
  if (saError || !sectionAttempt) {
    return NextResponse.json({ ok: false, error: "Section not found" }, { status: 404 });
  }

  // Existing rows, so a prior review pass is not thrown away.
  const { data: existing } = await supabase
    .from("question_attempts")
    .select("question_number, question_type_id, passage_domain_id, response_format, is_correct, error_cause, marks_earned")
    .eq("section_attempt_id", sectionAttemptId);

  const byNumber = new Map((existing ?? []).map((r) => [r.question_number as number, r]));

  // Delete-then-insert, matching how the review sheet saves. Idempotent, and at a
  // few dozen rows not worth a per-row upsert with no natural key to upsert on.
  const { error: delError } = await supabase
    .from("question_attempts")
    .delete()
    .eq("section_attempt_id", sectionAttemptId);
  if (delError) {
    return NextResponse.json({ ok: false, error: delError.message }, { status: 500 });
  }

  const payload = rows.map((r) => {
    const prior = byNumber.get(r.questionNumber);
    return {
      section_attempt_id: sectionAttemptId,
      set_attempt_id: null,
      question_number: r.questionNumber,
      // Measured, which is the entire point of this route.
      time_spent_sec: r.timeSpentSec,
      order_index: r.orderIndex,
      status: r.status,
      confidence: r.confidence,
      // Preserved from any earlier review pass; null when this is the first pass.
      question_type_id: prior?.question_type_id ?? null,
      passage_domain_id: prior?.passage_domain_id ?? null,
      response_format: prior?.response_format ?? "mcq",
      is_correct: r.status === "skipped" ? null : (prior?.is_correct ?? null),
      error_cause: prior?.error_cause ?? null,
      marks_earned: prior?.marks_earned ?? null,
    };
  });

  const { error: insertError } = await supabase.from("question_attempts").insert(payload);
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // This section's timings are now measured.
  const { error: markError } = await supabase
    .from("section_attempts")
    .update({ timing_source: "measured" })
    .eq("id", sectionAttemptId);
  if (markError) {
    return NextResponse.json({ ok: false, error: markError.message }, { status: 500 });
  }

  // Roll the attempt's provenance up from its sections. Conservative by design:
  // anything short of unanimity is 'mixed', because an attempt labelled
  // 'measured' would be read as wholly measured.
  const { data: siblings } = await supabase
    .from("section_attempts")
    .select("timing_source")
    .eq("mock_attempt_id", sectionAttempt.mock_attempt_id);

  const rolled = rollUpTimingSource(
    (siblings ?? []).map((s) => s.timing_source as TimingSource),
  );

  const { error: attemptError } = await supabase
    .from("mock_attempts")
    .update({ timing_source: rolled, entry_mode: "timed_in_app" })
    .eq("id", sectionAttempt.mock_attempt_id);
  if (attemptError) {
    return NextResponse.json({ ok: false, error: attemptError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: payload.length, attemptTimingSource: rolled });
}
