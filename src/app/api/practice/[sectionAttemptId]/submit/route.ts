import { NextRequest, NextResponse } from "next/server";
import { gradeResponse, sectionTotals, type Graded, type Marking } from "@/lib/grading";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Grades and saves a practice run.
 *
 * GRADING HAPPENS HERE, NEVER IN THE BROWSER. The answer key is read server-side
 * from `question_items` — the run page never sends it to the client — so a student
 * cannot see the key during the run, and cannot post a fabricated verdict either:
 * this route ignores any `isCorrect` in the request and derives it from the stored
 * key and the stored marking rules.
 *
 * MARKS COME FROM `exam_configs`. Not a constant in this file, per CLAUDE.md rule 7.
 * The config is the one recorded on the attempt at start, so a mid-season pattern
 * change cannot retroactively rescore an old run.
 *
 * Ownership is by RLS through the cookie client: a sectionAttemptId belonging to
 * someone else matches no rows.
 */

type IncomingRow = {
  questionItemId: string;
  questionNumber: number;
  selectedOption: number | null;
  responseText: string | null;
  confidence: number | null;
  timeSpentSec: number;
  orderIndex: number | null;
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
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { rows?: unknown; timeUsedSec?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request" }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to save" }, { status: 400 });
  }
  const rows = body.rows as IncomingRow[];
  const timeUsedSec = typeof body.timeUsedSec === "number" ? Math.max(0, body.timeUsedSec) : null;

  const { data: sectionAttempt } = await supabase
    .from("section_attempts")
    .select("id, mock_attempt_id, section_id")
    .eq("id", sectionAttemptId)
    .maybeSingle();
  if (!sectionAttempt) {
    return NextResponse.json({ ok: false, error: "Section not found" }, { status: 404 });
  }

  const { data: attempt } = await supabase
    .from("mock_attempts")
    .select("id, paper_id, exam_id, exam_config_id")
    .eq("id", sectionAttempt.mock_attempt_id)
    .maybeSingle();
  if (!attempt?.paper_id) {
    return NextResponse.json({ ok: false, error: "Not a practice attempt" }, { status: 409 });
  }

  // Refuse to double-submit. Without this a replayed request would delete a graded
  // run and re-grade it — harmless when identical, destructive when not.
  const { count: existing } = await supabase
    .from("question_attempts")
    .select("*", { count: "exact", head: true })
    .eq("section_attempt_id", sectionAttempt.id);
  if ((existing ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "This run has already been submitted" },
      { status: 409 },
    );
  }

  // ─── The answer key, read server-side ──────────────────────────────────────
  const { data: keyRows, error: keyError } = await supabase
    .from("paper_items")
    .select(
      "question_number, question_items(id, response_format, correct_option, correct_answer, question_type_id, passage_domain_id)",
    )
    .eq("paper_id", attempt.paper_id)
    .eq("section_id", sectionAttempt.section_id);
  if (keyError) {
    return NextResponse.json({ ok: false, error: keyError.message }, { status: 500 });
  }

  type KeyItem = {
    id: string;
    response_format: "mcq" | "tita";
    correct_option: number | null;
    correct_answer: string | null;
    question_type_id: string | null;
    passage_domain_id: string | null;
  };

  const keyByItemId = new Map<string, { item: KeyItem; questionNumber: number }>();
  for (const row of keyRows ?? []) {
    const item = (Array.isArray(row.question_items)
      ? row.question_items[0]
      : row.question_items) as KeyItem | null;
    if (item) {
      keyByItemId.set(item.id, { item, questionNumber: row.question_number as number });
    }
  }

  // ─── The marking rules ─────────────────────────────────────────────────────
  let configQuery = supabase
    .from("exam_configs")
    .select("mark_correct, mark_wrong_mcq, mark_wrong_numeric");
  configQuery = attempt.exam_config_id
    ? configQuery.eq("id", attempt.exam_config_id)
    : configQuery.eq("exam_id", attempt.exam_id).order("effective_year", { ascending: false }).limit(1);

  const { data: config } = await configQuery.maybeSingle();
  if (!config) {
    // Better to refuse than to invent a marking scheme.
    return NextResponse.json(
      { ok: false, error: "No marking configuration for this exam — cannot grade" },
      { status: 409 },
    );
  }

  const marking: Marking = {
    markCorrect: Number(config.mark_correct),
    markWrongMcq: Number(config.mark_wrong_mcq),
    markWrongNumeric: Number(config.mark_wrong_numeric),
  };

  // ─── Grade ─────────────────────────────────────────────────────────────────
  const graded: Graded[] = [];
  const payload = [];

  for (const row of rows) {
    const entry = keyByItemId.get(row.questionItemId);
    if (!entry) {
      // A response for an item that is not on this paper. Refuse the whole run
      // rather than silently dropping it, because a partial save would look complete.
      return NextResponse.json(
        { ok: false, error: "A submitted answer does not belong to this paper" },
        { status: 400 },
      );
    }

    const { item } = entry;
    const result = gradeResponse(
      {
        responseFormat: item.response_format,
        correctOption: item.correct_option,
        correctAnswer: item.correct_answer,
      },
      { selectedOption: row.selectedOption, responseText: row.responseText },
      marking,
    );
    graded.push(result);

    payload.push({
      section_attempt_id: sectionAttempt.id,
      set_attempt_id: null,
      question_item_id: item.id,
      question_number: entry.questionNumber,
      question_type_id: item.question_type_id,
      passage_domain_id: item.passage_domain_id,
      response_format: item.response_format,
      selected_option: item.response_format === "mcq" ? row.selectedOption : null,
      response_text: item.response_format === "tita" ? row.responseText : null,
      time_spent_sec: Math.max(0, Math.floor(row.timeSpentSec ?? 0)),
      order_index: row.orderIndex,
      status: result.status,
      is_correct: result.isCorrect,
      confidence: row.confidence,
      // Left null deliberately. The error CAUSE is the student's own judgement —
      // concept vs misread vs silly vs time — and ASHA never infers it. They tag it
      // afterwards in the review flow. Guessing it here would be the exact
      // overclaim the revision queue's honesty depends on not making.
      error_cause: null,
      marks_earned: result.marksEarned,
    });
  }

  const { error: insertError } = await supabase.from("question_attempts").insert(payload);
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const totals = sectionTotals(graded);

  const { error: sectionError } = await supabase
    .from("section_attempts")
    .update({
      score: totals.marks,
      time_used_sec: timeUsedSec,
      num_attempted: totals.attempted,
      num_correct: totals.correct,
      num_incorrect: totals.incorrect,
      num_skipped: totals.skipped,
      timing_source: "measured",
    })
    .eq("id", sectionAttempt.id);
  if (sectionError) {
    return NextResponse.json({ ok: false, error: sectionError.message }, { status: 500 });
  }

  // The attempt's own total. Summed from the section attempts rather than from this
  // run alone, so a multi-section paper adds up correctly when that arrives.
  const { data: siblings } = await supabase
    .from("section_attempts")
    .select("score")
    .eq("mock_attempt_id", attempt.id);

  const total = (siblings ?? []).reduce((sum, s) => sum + Number(s.score ?? 0), 0);

  const { error: attemptError } = await supabase
    .from("mock_attempts")
    .update({ total_score: Math.round(total * 100) / 100, is_complete: true })
    .eq("id", attempt.id);
  if (attemptError) {
    return NextResponse.json({ ok: false, error: attemptError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    ...totals,
  });
}
