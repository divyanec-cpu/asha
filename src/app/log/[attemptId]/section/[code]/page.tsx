import { redirect } from "next/navigation";
import QuestionSheet from "./QuestionSheet";
import SetSheet from "./SetSheet";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * One route for every section. Which sheet renders is decided by the DATA:
 *
 *   the section owns `set_archetype` taxonomy nodes  → SetSheet    (DILR)
 *   otherwise                                        → QuestionSheet (VARC, QA)
 *
 * This replaced a hardcoded `/log/[attemptId]/dilr`. Nothing here knows the
 * string "DILR", so an exam whose set-based section is called something else
 * works without a code change — which is what CLAUDE.md's no-exam-facts-in-code
 * rule is for.
 */
export default async function SectionPage({
  params,
}: {
  params: Promise<{ attemptId: string; code: string }>;
}) {
  const { attemptId, code } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: attempt } = await supabase
    .from("mock_attempts")
    .select(
      "id, exam_id, mock_sources(title), exam_configs(mark_correct, mark_wrong_mcq, mark_wrong_numeric)",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) redirect("/log");

  const { data: section } = await supabase
    .from("sections")
    .select("id, code, name, question_count")
    .eq("exam_id", attempt.exam_id)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!section) redirect(`/log/${attemptId}`);

  const { data: sectionAttempt } = await supabase
    .from("section_attempts")
    .select("id, score")
    .eq("mock_attempt_id", attempt.id)
    .eq("section_id", section.id)
    .maybeSingle();
  if (!sectionAttempt) redirect(`/log/${attemptId}`);

  const cfg = one(attempt.exam_configs);
  const scheme = {
    markCorrect: Number(cfg?.mark_correct ?? 0),
    markWrongMcq: Number(cfg?.mark_wrong_mcq ?? 0),
    markWrongNumeric: Number(cfg?.mark_wrong_numeric ?? 0),
  };
  const mockTitle = one(attempt.mock_sources)?.title ?? "This mock";

  // Everything this section can be tagged with, in one query.
  const { data: taxonomy } = await supabase
    .from("question_types")
    .select("id, code, name, description, kind, is_leaf, parent_id, sort_order")
    .eq("exam_id", attempt.exam_id)
    .eq("section_id", section.id)
    .eq("active", true)
    .order("sort_order");

  const nodes = taxonomy ?? [];
  const archetypes = nodes.filter((n) => n.kind === "set_archetype" && n.is_leaf);

  // ── Set-based section ────────────────────────────────────────────────────
  if (archetypes.length > 0) {
    const { data: sets } = await supabase
      .from("set_attempts")
      .select(
        "id, archetype_id, label, num_questions, num_attempted, num_correct, chosen, selection_order, time_spent_sec, marks_earned, solvable_verdict",
      )
      .eq("section_attempt_id", sectionAttempt.id)
      .order("created_at");

    return (
      <SetSheet
        attemptId={attempt.id}
        sectionAttemptId={sectionAttempt.id}
        sectionCode={section.code}
        sectionQuestionCount={section.question_count}
        reportedSectionScore={sectionAttempt.score === null ? null : Number(sectionAttempt.score)}
        mockTitle={mockTitle}
        scheme={scheme}
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

  // ── Question-based section ───────────────────────────────────────────────
  // Leaf question types, grouped under their parent so a 31-leaf section stays
  // navigable. Passage domains are a separate kind and get their own picker.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeGroups = nodes
    .filter((n) => n.kind === "question_type" && !n.is_leaf)
    .map((parent) => ({
      id: parent.id,
      name: parent.name,
      leaves: nodes
        .filter((n) => n.parent_id === parent.id && n.is_leaf && n.kind === "question_type")
        .map((n) => ({ id: n.id, name: n.name })),
    }))
    .filter((g) => g.leaves.length > 0);

  // Leaves whose parent is itself a leaf-less non-group (rare) or top-level.
  const ungrouped = nodes
    .filter(
      (n) =>
        n.kind === "question_type" &&
        n.is_leaf &&
        (n.parent_id === null || byId.get(n.parent_id)?.kind !== "question_type"),
    )
    .map((n) => ({ id: n.id, name: n.name }));
  if (ungrouped.length > 0) {
    typeGroups.push({ id: "ungrouped", name: "Other", leaves: ungrouped });
  }

  const passageDomains = nodes
    .filter((n) => n.kind === "passage_domain" && n.is_leaf)
    .map((n) => ({ id: n.id, name: n.name }));

  const { data: questions } = await supabase
    .from("question_attempts")
    .select(
      "id, question_number, question_type_id, passage_domain_id, response_format, time_spent_sec, status, is_correct, confidence, error_cause, marks_earned",
    )
    .eq("section_attempt_id", sectionAttempt.id)
    .order("question_number");

  return (
    <QuestionSheet
      attemptId={attempt.id}
      sectionAttemptId={sectionAttempt.id}
      sectionCode={section.code}
      questionCount={section.question_count}
      reportedSectionScore={sectionAttempt.score === null ? null : Number(sectionAttempt.score)}
      mockTitle={mockTitle}
      scheme={scheme}
      typeGroups={typeGroups}
      passageDomains={passageDomains}
      initialQuestions={(questions ?? []).map((q) => ({
        questionNumber: q.question_number ?? 0,
        typeId: q.question_type_id,
        passageDomainId: q.passage_domain_id,
        responseFormat: q.response_format as "mcq" | "tita",
        timeSpentSec: q.time_spent_sec,
        status: q.status as "attempted" | "skipped" | "revisited",
        isCorrect: q.is_correct,
        confidence: q.confidence,
        errorCause: q.error_cause,
      }))}
    />
  );
}
