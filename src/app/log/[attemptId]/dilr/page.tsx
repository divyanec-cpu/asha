import { redirect } from "next/navigation";
import SetSheet from "./SetSheet";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The DILR set sheet — the signature feature (design 1g).
 *
 * WHICH SECTION IS THIS? Resolved from data, not from the string "DILR": the
 * set-based section is whichever one owns `set_archetype` taxonomy nodes. The URL
 * says `dilr` because that is what a CAT aspirant calls it, but nothing in the
 * query depends on that name, so an exam whose set-based section is called
 * something else needs no code change.
 */
export default async function DilrPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // RLS restricts this to the caller's own attempts, so a wrong id 404s rather
  // than leaking anything.
  const { data: attempt } = await supabase
    .from("mock_attempts")
    .select(
      "id, exam_id, taken_on, is_complete, mock_sources(title), exam_configs(mark_correct, mark_wrong_mcq, mark_wrong_numeric)",
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) redirect("/log");

  const { data: archetypes } = await supabase
    .from("question_types")
    .select("id, name, description, section_id, sort_order")
    .eq("exam_id", attempt.exam_id)
    .eq("kind", "set_archetype")
    .eq("is_leaf", true)
    .eq("active", true)
    .order("sort_order");

  if (!archetypes?.length) {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-3 bg-paper px-7">
        <h1 className="text-[20px] font-semibold text-ink text-pretty">
          No set archetypes are seeded.
        </h1>
        <p className="text-[13px] leading-relaxed text-[#6B6659]">
          The set sheet needs `question_types` rows with kind = &lsquo;set_archetype&rsquo;. Run
          scripts/seed-cat-taxonomy.mjs.
        </p>
      </main>
    );
  }

  const setSectionId = archetypes[0].section_id;

  const { data: section } = await supabase
    .from("sections")
    .select("id, code, name, question_count")
    .eq("id", setSectionId)
    .maybeSingle();

  const { data: sectionAttempt } = await supabase
    .from("section_attempts")
    .select("id, score")
    .eq("mock_attempt_id", attempt.id)
    .eq("section_id", setSectionId)
    .maybeSingle();

  if (!section || !sectionAttempt) redirect("/log");

  const { data: sets } = await supabase
    .from("set_attempts")
    .select(
      "id, archetype_id, label, num_questions, num_attempted, num_correct, chosen, selection_order, time_spent_sec, marks_earned, solvable_verdict",
    )
    .eq("section_attempt_id", sectionAttempt.id)
    .order("created_at");

  const cfg = one(attempt.exam_configs);

  return (
    <SetSheet
      attemptId={attempt.id}
      sectionAttemptId={sectionAttempt.id}
      sectionCode={section.code}
      sectionQuestionCount={section.question_count}
      reportedSectionScore={sectionAttempt.score === null ? null : Number(sectionAttempt.score)}
      mockTitle={one(attempt.mock_sources)?.title ?? "This mock"}
      scheme={{
        markCorrect: Number(cfg?.mark_correct ?? 0),
        markWrongMcq: Number(cfg?.mark_wrong_mcq ?? 0),
        markWrongNumeric: Number(cfg?.mark_wrong_numeric ?? 0),
      }}
      archetypes={archetypes.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
      }))}
      initialSets={(sets ?? []).map((s) => ({
        id: s.id,
        archetypeId: s.archetype_id,
        label: s.label,
        numQuestions: s.num_questions,
        numAttempted: s.num_attempted,
        numCorrect: s.num_correct,
        chosen: s.chosen,
        selectionOrder: s.selection_order,
        timeSpentSec: s.time_spent_sec,
        marksEarned: Number(s.marks_earned ?? 0),
        verdict: s.solvable_verdict,
      }))}
    />
  );
}
