import Link from "next/link";
import { redirect } from "next/navigation";
import CompleteButton from "./CompleteButton";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Attempt overview — the three sections and how far each has got.
 *
 * This exists because a mock is logged section by section and the student is
 * expected to stop halfway. Without a page like this, "resume" has to guess
 * which section they were on.
 *
 * Which sections exist, their order, and their question counts all come from
 * `sections`. Whether a section is logged set-by-set or question-by-question is
 * derived from whether it owns `set_archetype` taxonomy nodes — never from its
 * code.
 */
export default async function AttemptPage({
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

  const { data: attempt } = await supabase
    .from("mock_attempts")
    .select("id, exam_id, taken_on, total_score, is_complete, paper_id, mock_sources(title), practice_papers(title, is_full_mock)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) redirect("/log");

  // A practice paper covers only the sections it actually contains. Listing the
  // exam's full set would show a QA-only practice set as a three-section mock with
  // VARC and DILR "NOT STARTED", which reads as an abandoned mock rather than a
  // finished practice run.
  const isPractice = attempt.paper_id !== null;
  let paperSectionIds: string[] | null = null;
  // How many questions the PAPER holds per section — not how many the exam's real
  // section has. A 14-question practice set shown as "3 / 22 Q" would be reporting
  // against a denominator that does not exist for this paper.
  const paperCounts = new Map<string, number>();
  if (isPractice) {
    const { data: paperItems } = await supabase
      .from("paper_items")
      .select("section_id")
      .eq("paper_id", attempt.paper_id);
    for (const row of paperItems ?? []) {
      const id = row.section_id as string;
      paperCounts.set(id, (paperCounts.get(id) ?? 0) + 1);
    }
    paperSectionIds = [...paperCounts.keys()];
  }

  let sectionQuery = supabase
    .from("sections")
    .select("id, code, name, ordinal, question_count")
    .eq("exam_id", attempt.exam_id);
  if (paperSectionIds !== null) sectionQuery = sectionQuery.in("id", paperSectionIds);
  const { data: sections } = await sectionQuery.order("ordinal");

  const { data: sectionAttempts } = await supabase
    .from("section_attempts")
    .select("id, section_id, score")
    .eq("mock_attempt_id", attempt.id);

  // Sections that log by set are the ones owning set archetypes.
  const { data: archetypeSections } = await supabase
    .from("question_types")
    .select("section_id")
    .eq("exam_id", attempt.exam_id)
    .eq("kind", "set_archetype");
  const setBased = new Set((archetypeSections ?? []).map((r) => r.section_id));

  const saIds = (sectionAttempts ?? []).map((s) => s.id);

  // Progress per section: sets logged for set-based sections, questions for the
  // rest. Two cheap counts rather than one clever query.
  const [{ data: sets }, { data: questions }] = await Promise.all([
    supabase.from("set_attempts").select("section_attempt_id, num_questions").in("section_attempt_id", saIds.length ? saIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("question_attempts").select("section_attempt_id").in("section_attempt_id", saIds.length ? saIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const rows = (sections ?? []).map((s) => {
    const sa = (sectionAttempts ?? []).find((x) => x.section_id === s.id);
    /*
     * A PRACTICE RUN IS ALWAYS QUESTION-LEVEL, even for DILR.
     *
     * Elsewhere, DILR is set-based because the student is replaying a mock taken
     * somewhere else: they never recorded per-question data, and the decision worth
     * analysing is which sets they picked. Inside a practice run ASHA holds the
     * questions and times each one, so it captures per-question outcomes AND the
     * order they were worked in — strictly more than the logging flow can get.
     *
     * Without this, a DILR practice attempt would count `set_attempts` (of which it
     * has none) and report "0 / 12 Q · BY SET" for a run that was in fact complete.
     */
    const isSetBased = !isPractice && setBased.has(s.id);
    const accounted = isSetBased
      ? (sets ?? [])
          .filter((r) => r.section_attempt_id === sa?.id)
          .reduce((sum, r) => sum + r.num_questions, 0)
      : (questions ?? []).filter((r) => r.section_attempt_id === sa?.id).length;
    const questionCount = isPractice ? (paperCounts.get(s.id) ?? null) : s.question_count;
    return {
      code: s.code,
      name: s.name,
      questionCount,
      reportedScore: sa?.score === null || sa?.score === undefined ? null : Number(sa.score),
      accounted,
      complete: questionCount !== null && accounted === questionCount,
      isSetBased,
    };
  });

  const allComplete = rows.length > 0 && rows.every((r) => r.complete);

  // Sections a timed run makes sense for: question-based, and not yet logged.
  // Never for a practice attempt — that was already run under ASHA's clock and
  // graded, so offering to "time yourself" on it makes no sense and the route would
  // overwrite the graded rows.
  const timeable = isPractice ? [] : rows.filter((r) => !r.isSetBased && r.accounted === 0);

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-paper">
            {one(attempt.practice_papers)?.title ??
              one(attempt.mock_sources)?.title ??
              "This mock"}
          </span>
          <Link
            href={isPractice ? "/practice" : "/log"}
            className="font-mono text-xs font-medium text-brass"
          >
            {isPractice ? "PRACTICE" : "ALL MOCKS"}
          </Link>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          {isPractice
            ? "Marked by ASHA against its own answer key, on measured timings. Kept out of your cross-mock trend — a practice set is not a mock."
            : attempt.is_complete
              ? "Logged. You can still come back and change anything."
              : "Three sections. Do them in any order, and stop whenever you like."}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4">
        {rows.map((r) => (
          <Link
            key={r.code}
            href={`/log/${attempt.id}/section/${r.code}`}
            className={`rounded-[13px] border px-4 py-4 ${
              r.complete ? "border-cleared/40 bg-white" : "border-ink/[0.12] bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold text-ink">{r.code}</span>
              {r.complete ? (
                <span className="rounded bg-cleared px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] text-white">
                  LOGGED
                </span>
              ) : (
                <span className="font-mono text-[11px] font-medium text-brass">
                  {r.accounted === 0 ? "NOT STARTED" : "IN PROGRESS"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[11.5px] font-medium text-[#6B6659]">
              <span className="tnum">
                {r.accounted}
                {r.questionCount !== null && ` / ${r.questionCount}`} Q
              </span>
              <span>{r.isSetBased ? "BY SET" : "BY QUESTION"}</span>
              {/*
                "REPORTED" is only true for a logged mock, where the student typed
                in what their mock platform told them. A practice score was computed
                here from ASHA's own answer key, so calling it reported would
                misattribute the number.
              */}
              {r.reportedScore !== null && (
                <span className="tnum">
                  {r.reportedScore} {isPractice ? "MARKED BY ASHA" : "REPORTED"}
                </span>
              )}
            </div>
          </Link>
        ))}

        {/*
          Timed runs, offered only for question-based sections and only before
          anything is logged for them. A timed run rewrites the section's question
          rows, so offering it on a section already logged would invite someone to
          overwrite work they'd done — the route preserves correctness, but the
          safer default is not to suggest it at all.
        */}
        {timeable.length > 0 && (
          <div className="mt-1 rounded-[13px] border border-brass/40 bg-brass/[0.06] px-4 py-3.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-brass">
              OR TIME YOURSELF
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#4A463D] text-pretty">
              Haven&rsquo;t taken it yet? ASHA can run the clock while you work through the paper,
              so your timings are measured instead of remembered.
            </p>
            <div className="mt-2.5 flex gap-2">
              {timeable.map((r) => (
                <Link
                  key={r.code}
                  href={`/log/${attempt.id}/timed/${r.code}`}
                  className="flex-1 rounded-[10px] bg-ink py-2.5 text-center font-mono text-[11px] font-semibold tracking-[0.06em] text-paper"
                >
                  TIME {r.code}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/*
          A practice attempt is complete the moment it is graded — there is nothing
          for the student to mark done, and the "some sections aren't fully logged"
          warning would be nonsense against a single-section paper.
        */}
        <div className="mt-auto pb-6 pt-3">
          {isPractice ? (
            <Link
              href="/practice"
              className="block rounded-[13px] bg-brass py-4 text-center text-[15px] font-semibold text-white"
            >
              Back to practice
            </Link>
          ) : (
            <CompleteButton
              attemptId={attempt.id}
              allComplete={allComplete}
              isComplete={attempt.is_complete}
            />
          )}
        </div>
      </div>
    </main>
  );
}
