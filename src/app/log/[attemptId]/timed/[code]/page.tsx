import { redirect } from "next/navigation";
import TimedRunner from "./TimedRunner";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Timed run for one section.
 *
 * Only offered for question-based sections. DILR is logged at set level in v1, so
 * there is no per-question timing to measure there — timing a DILR section would
 * mean timing five sets, which is a different feature and not this one. The
 * set-based section is identified the same way it is everywhere else: by owning
 * `set_archetype` taxonomy nodes, never by its code.
 */
export default async function TimedPage({
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
    .select("id, exam_id, mock_sources(title)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) redirect("/log");

  const { data: section } = await supabase
    .from("sections")
    .select("id, code, question_count, time_limit_min")
    .eq("exam_id", attempt.exam_id)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!section) redirect(`/log/${attemptId}`);

  // Set-based sections have no per-question timing to capture.
  const { data: archetypes } = await supabase
    .from("question_types")
    .select("id")
    .eq("exam_id", attempt.exam_id)
    .eq("section_id", section.id)
    .eq("kind", "set_archetype")
    .limit(1);
  if (archetypes && archetypes.length > 0) redirect(`/log/${attemptId}/section/${section.code}`);

  const { data: sectionAttempt } = await supabase
    .from("section_attempts")
    .select("id")
    .eq("mock_attempt_id", attempt.id)
    .eq("section_id", section.id)
    .maybeSingle();
  if (!sectionAttempt) redirect(`/log/${attemptId}`);

  return (
    <TimedRunner
      attemptId={attempt.id}
      sectionAttemptId={sectionAttempt.id}
      sectionCode={section.code}
      questionCount={section.question_count ?? 0}
      timeLimitMin={section.time_limit_min}
      mockTitle={one(attempt.mock_sources)?.title ?? "This mock"}
    />
  );
}
