import { redirect } from "next/navigation";
import PaperRunner from "./PaperRunner";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Loads a practice paper for a run.
 *
 * THE ANSWER KEY IS NOT SENT TO THE BROWSER. `question_items` holds
 * `correct_option`, `correct_answer` and `solution`, and this query selects none of
 * them — the runner receives stems and options only, and grading happens in the
 * submit route against rows read server-side. Shipping the key would put every
 * answer in the page source, which is a strange way to run a timed test.
 *
 * A run already submitted is not reopened: the section's questions would be
 * rewritten and the student would lose the graded attempt.
 */
export default async function PracticeRunPage({
  params,
}: {
  params: Promise<{ sectionAttemptId: string }>;
}) {
  const { sectionAttemptId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: sectionAttempt } = await supabase
    .from("section_attempts")
    .select("id, mock_attempt_id, section_id, sections(code, name)")
    .eq("id", sectionAttemptId)
    .maybeSingle();
  if (!sectionAttempt) redirect("/practice");

  const { data: attempt } = await supabase
    .from("mock_attempts")
    .select("id, paper_id, is_complete, practice_papers(title, time_limit_min, is_full_mock)")
    .eq("id", sectionAttempt.mock_attempt_id)
    .maybeSingle();
  if (!attempt?.paper_id) redirect("/practice");

  // Already answered? Send them to the graded attempt rather than letting a reload
  // wipe it.
  const { count: alreadyAnswered } = await supabase
    .from("question_attempts")
    .select("*", { count: "exact", head: true })
    .eq("section_attempt_id", sectionAttempt.id);
  if ((alreadyAnswered ?? 0) > 0) redirect(`/log/${attempt.id}`);

  const paper = one(attempt.practice_papers);
  const section = one(sectionAttempt.sections);

  // Stems and options only. No correct_option, no correct_answer, no solution.
  const { data: items } = await supabase
    .from("paper_items")
    .select("question_number, question_items(id, stem, response_format, options)")
    .eq("paper_id", attempt.paper_id)
    .eq("section_id", sectionAttempt.section_id)
    .order("question_number");

  const questions = (items ?? [])
    .map((row) => {
      const q = one(row.question_items) as {
        id: string;
        stem: string;
        response_format: "mcq" | "tita";
        options: string[] | null;
      } | null;
      if (!q) return null;
      return {
        itemId: q.id,
        questionNumber: row.question_number as number,
        stem: q.stem,
        responseFormat: q.response_format,
        options: q.options ?? [],
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (questions.length === 0) redirect("/practice");

  // A partial paper declares its own clock; only a full mock falls back to the
  // section's. Migration 0009 enforces that a partial paper cannot have a null
  // time_limit_min, so this fallback is reachable only for full mocks.
  let timeLimitMin = paper?.time_limit_min ?? null;
  if (timeLimitMin === null) {
    const { data: sectionRow } = await supabase
      .from("sections")
      .select("time_limit_min")
      .eq("id", sectionAttempt.section_id)
      .maybeSingle();
    timeLimitMin = sectionRow?.time_limit_min ?? null;
  }

  return (
    <PaperRunner
      sectionAttemptId={sectionAttempt.id}
      attemptId={attempt.id}
      paperTitle={paper?.title ?? "Practice"}
      sectionCode={section?.code ?? ""}
      timeLimitMin={timeLimitMin}
      questions={questions}
    />
  );
}
