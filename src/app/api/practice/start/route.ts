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

  /*
   * Which sections this paper covers. A practice set is one section; a full mock is
   * three, and CAT runs them STRICTLY IN ORDER with a separate clock each — you
   * cannot return to a section once you have left it.
   *
   * That constraint makes a mock simpler to model, not harder: it is three
   * sequential single-section runs sharing one attempt. A section_attempt is created
   * for each up front, and the runner is handed the first; each submit hands over
   * the next. Nothing needs to hold three clocks at once.
   *
   * Ordering comes from `sections.ordinal`, never from the order rows came back in.
   */
  const { data: items } = await supabase
    .from("paper_items")
    .select("section_id, sections(ordinal)")
    .eq("paper_id", paper.id);

  const byId = new Map<string, number>();
  for (const row of items ?? []) {
    const ordinal = (Array.isArray(row.sections) ? row.sections[0] : row.sections)?.ordinal ?? 0;
    byId.set(row.section_id as string, ordinal as number);
  }
  const sectionIds = [...byId.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

  if (sectionIds.length === 0) {
    return NextResponse.json({ ok: false, error: "This paper has no questions" }, { status: 409 });
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

  // One section_attempt per section, created up front so the run can hand over from
  // one to the next without a second write path.
  const { data: sectionAttempts, error: sectionError } = await supabase
    .from("section_attempts")
    .insert(
      sectionIds.map((section_id) => ({
        mock_attempt_id: attempt.id,
        section_id,
        timing_source: "measured",
      })),
    )
    .select("id, section_id");
  if (sectionError) {
    return NextResponse.json({ ok: false, error: sectionError.message }, { status: 500 });
  }

  // Insert order is not guaranteed on the way back, so the first section is looked
  // up by id rather than taken from position.
  const first = (sectionAttempts ?? []).find((s) => s.section_id === sectionIds[0]);
  if (!first) {
    return NextResponse.json({ ok: false, error: "Could not open the first section" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    sectionAttemptId: first.id,
    sectionCount: sectionIds.length,
  });
}
