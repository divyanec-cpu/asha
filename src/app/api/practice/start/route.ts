import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Starts a practice paper: creates the mock attempt and its section attempt, then
 * returns the section attempt id for the runner.
 *
 * `entry_mode = 'in_app_test'` and `timing_source = 'measured'` are set here rather
 * than on submit, because they are true from the moment the clock starts. An
 * abandoned run is still a measured run of the questions it reached.
 *
 * Everything runs through the cookie client, so RLS decides what the caller may
 * see: a paperId whose source they cannot read matches no rows, and the attempt
 * rows are created under their own user id. There is no admin client here and no
 * ownership check to get wrong.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { paperId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request" }, { status: 400 });
  }
  const paperId = typeof body.paperId === "string" ? body.paperId : null;
  if (!paperId) {
    return NextResponse.json({ ok: false, error: "No paper specified" }, { status: 400 });
  }

  // Readable only if RLS lets this caller see the paper's source.
  const { data: paper } = await supabase
    .from("practice_papers")
    .select("id, exam_id, title, active, time_limit_min")
    .eq("id", paperId)
    .maybeSingle();
  if (!paper || !paper.active) {
    return NextResponse.json({ ok: false, error: "Paper not available" }, { status: 404 });
  }

  // Which section this paper's questions belong to. v1 papers are single-section;
  // a multi-section paper would create one section_attempt per distinct section, and
  // this is the only place that would need to change.
  const { data: items } = await supabase
    .from("paper_items")
    .select("section_id")
    .eq("paper_id", paper.id);

  const sectionIds = [...new Set((items ?? []).map((r) => r.section_id as string))];
  if (sectionIds.length === 0) {
    return NextResponse.json({ ok: false, error: "This paper has no questions" }, { status: 409 });
  }
  if (sectionIds.length > 1) {
    // Fail loudly rather than silently timing only the first section.
    return NextResponse.json(
      { ok: false, error: "Multi-section papers are not supported yet" },
      { status: 409 },
    );
  }

  // The marking rules in force. Stored on the attempt so a later pattern change
  // cannot retroactively rescore an old attempt.
  const { data: config } = await supabase
    .from("exam_configs")
    .select("id")
    .eq("exam_id", paper.exam_id)
    .order("effective_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);

  const { data: attempt, error: attemptError } = await supabase
    .from("mock_attempts")
    .insert({
      user_id: user.id,
      exam_id: paper.exam_id,
      exam_config_id: config?.id ?? null,
      source_id: null,
      paper_id: paper.id,
      taken_on: today,
      // True from the first tick: ASHA is holding the clock.
      timing_source: "measured",
      entry_mode: "in_app_test",
      is_complete: false,
    })
    .select("id")
    .single();
  if (attemptError) {
    return NextResponse.json({ ok: false, error: attemptError.message }, { status: 500 });
  }

  const { data: sectionAttempt, error: sectionError } = await supabase
    .from("section_attempts")
    .insert({
      mock_attempt_id: attempt.id,
      section_id: sectionIds[0],
      timing_source: "measured",
    })
    .select("id")
    .single();
  if (sectionError) {
    return NextResponse.json({ ok: false, error: sectionError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    sectionAttemptId: sectionAttempt.id,
  });
}
