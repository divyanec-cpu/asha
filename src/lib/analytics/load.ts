import "server-only";

import { createServerSupabaseClient } from "../supabase/server";
import { one } from "../supabase/relations";
import type { MarkingScheme } from "../marking";
import type { ErrorCause, MockRow, QuestionRow, SectionRow, SetRow, Verdict } from "./types";

/**
 * Loads everything the analytics need for the signed-in user, in one place.
 *
 * Deliberately NOT part of lib/analytics' pure core — this is the only file in
 * the analytics folder that touches Supabase, and it does no arithmetic. The
 * separation is the architectural rule: the pure functions stay testable without
 * a database, and this adapter is the single seam where DB shapes become
 * analytics shapes. Three screens read the same loader, so they cannot drift.
 *
 * RLS scopes every query to the caller, so no user_id filter is needed — but
 * only complete attempts are counted. A half-logged mock would otherwise drag
 * every average down and make a student look like they had regressed.
 */

export type AnalyticsData = {
  mocks: MockRow[];
  sections: SectionRow[];
  sets: SetRow[];
  questions: QuestionRow[];
  scheme: MarkingScheme;
  /** Distinct providers across logged mocks — the trend view says so, because
   *  scores from different providers are not a comparable series. */
  providers: number;
  /** Attempts started but not finished. Surfaced so home can nudge. */
  unfinished: { id: string; title: string }[];
  /**
   * Completed full-length mocks sat inside ASHA, whose per-question rows are in
   * `questions` but whose scores are deliberately absent from `mocks`.
   *
   * Surfaced so a screen can SAY when a per-type reading rests partly on ASHA's own
   * questions. That matters: ASHA's paper is not calibrated against a mock
   * provider's, so a blended accuracy figure is defensible only if the blend is
   * visible. Zero for a student who has only logged real mocks.
   */
  practiceMockCount: number;
};

export async function loadAnalyticsData(): Promise<AnalyticsData | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: attempts } = await supabase
    .from("mock_attempts")
    .select(
      "id, taken_on, total_score, timing_source, is_complete, paper_id, mock_sources(title, provider), practice_papers(is_full_mock), exam_configs(mark_correct, mark_wrong_mcq, mark_wrong_numeric)",
    )
    .order("taken_on");

  /*
   * WHERE PRACTICE DATA IS ALLOWED, AND WHERE IT IS NOT. (Decided 2026-08-06.)
   *
   * Two different questions, and they get different answers.
   *
   * SCORES — practice never enters, full mock or not. ASHA's own paper is not
   * calibrated against SimCAT's, so putting its total in the same series would make
   * "+8.7 vs your last three" a number computed across incomparable things. It would
   * also inflate the mock count behind the global confidence chip, telling a student
   * their readings were firmer for having practised. So `mocks`, `sections` and
   * everything derived from them stay logged-mocks-only.
   *
   * PER-QUESTION DATA — a COMPLETED FULL MOCK is admitted. Accuracy by question
   * type is a ratio, not a total, so the out-of-42-versus-out-of-204 objection does
   * not apply; the taxonomy is the same; and the timings are `measured` rather than
   * recalled, which is better evidence than a logged mock can offer.
   *
   * PARTIAL PRACTICE SETS ARE STILL EXCLUDED, and the reason is not squeamishness.
   * They are deliberately skewed — the coverage set is easy by design, the challenge
   * set hard by design — so including them would bias per-type accuracy in a
   * direction that depends on which set the student happened to pick. A skew that
   * varies by choice cannot be corrected by labelling it, which is why the line is
   * drawn at the full mock: three sections, full difficulty spread, one unit of work.
   */
  type PaperFlag = { is_full_mock: boolean } | { is_full_mock: boolean }[] | null;
  const isFullMock = (a: { paper_id: string | null; practice_papers: PaperFlag }) =>
    a.paper_id !== null && one(a.practice_papers)?.is_full_mock === true;

  const everything = attempts ?? [];
  const all = everything.filter((a) => a.paper_id === null);
  const complete = all.filter((a) => a.is_complete);

  // Completed ASHA mocks: per-question data only.
  const practiceMocks = everything.filter((a) => a.is_complete && isFullMock(a));

  // Marking scheme from the most recent attempt's config. Never hardcoded: a
  // pattern change is a data edit (CLAUDE.md rule 7).
  const latestCfg = one(complete.at(-1)?.exam_configs ?? all.at(-1)?.exam_configs ?? null);
  const scheme: MarkingScheme = {
    markCorrect: Number(latestCfg?.mark_correct ?? 0),
    markWrongMcq: Number(latestCfg?.mark_wrong_mcq ?? 0),
    markWrongNumeric: Number(latestCfg?.mark_wrong_numeric ?? 0),
  };

  const mocks: MockRow[] = complete.map((a) => ({
    id: a.id,
    takenOn: a.taken_on,
    title: one(a.mock_sources)?.title ?? "Untitled mock",
    totalScore: a.total_score === null ? null : Number(a.total_score),
    timingSource: a.timing_source as MockRow["timingSource"],
  }));

  const unfinished = all
    .filter((a) => !a.is_complete)
    .map((a) => ({ id: a.id, title: one(a.mock_sources)?.title ?? "Untitled mock" }));

  // A student who has only sat ASHA mocks still has per-question data worth
  // reading, so the early return waits until BOTH sources are empty.
  if (mocks.length === 0 && practiceMocks.length === 0) {
    return { mocks, sections: [], sets: [], questions: [], scheme, providers: 0, unfinished, practiceMockCount: 0 };
  }

  const mockIds = mocks.map((m) => m.id);
  const practiceIds = practiceMocks.map((a) => a.id);
  // Section attempts are fetched for both, then split: `sections` (which carries
  // scores and pacing) keeps only the logged mocks, while question rows take both.
  const analysableIds = [...mockIds, ...practiceIds];
  const loggedMockIds = new Set(mockIds);

  const { data: sectionAttempts } = await supabase
    .from("section_attempts")
    .select("id, mock_attempt_id, score, quarter_marks, sections(code, ordinal)")
    .in("mock_attempt_id", analysableIds);

  // Sort by the section's own ordinal. PostgREST returns `in()` results in no
  // guaranteed order, which rendered the score cards as DILR / VARC / QA — not
  // the order of the actual paper. Ordinal comes from the sections table, so
  // nothing here hardcodes a section sequence.
  const sa = (sectionAttempts ?? []).slice().sort((a, b) => {
    const oa = one(a.sections)?.ordinal ?? 0;
    const ob = one(b.sections)?.ordinal ?? 0;
    return oa - ob;
  });
  const saIds = sa.map((s) => s.id);
  const mockOf = new Map(sa.map((s) => [s.id, s.mock_attempt_id]));
  const codeOf = new Map(sa.map((s) => [s.id, one(s.sections)?.code ?? "?"]));

  // Scores and pacing come from logged mocks ONLY. An ASHA mock's section score is
  // not comparable to a SimCAT section score, and this array feeds the score cards
  // and the pacing measure.
  const sections: SectionRow[] = sa
    .filter((s) => loggedMockIds.has(s.mock_attempt_id))
    .map((s) => ({
      mockId: s.mock_attempt_id,
      sectionCode: one(s.sections)?.code ?? "?",
      score: s.score === null ? null : Number(s.score),
      quarterMarks: s.quarter_marks as number[] | null,
    }));

  // Guard against an empty `in()`, which PostgREST treats as matching nothing —
  // harmless here, but an explicit early return is clearer than a sentinel uuid.
  if (saIds.length === 0) {
    return { mocks, sections, sets: [], questions: [], scheme, providers: 0, unfinished, practiceMockCount: practiceMocks.length };
  }

  const [{ data: setRows }, { data: questionRows }] = await Promise.all([
    supabase
      .from("set_attempts")
      .select(
        "section_attempt_id, archetype_id, chosen, selection_order, time_spent_sec, marks_earned, num_questions, solvable_verdict, question_types(name)",
      )
      .in("section_attempt_id", saIds),
    supabase
      .from("question_attempts")
      .select(
        "section_attempt_id, question_type_id, passage_domain_id, response_format, time_spent_sec, status, is_correct, confidence, error_cause, marks_earned",
      )
      .in("section_attempt_id", saIds),
  ]);

  // Taxonomy names, resolved once. The rows carry ids; the UI needs names.
  const typeIds = new Set<string>();
  for (const q of questionRows ?? []) {
    if (q.question_type_id) typeIds.add(q.question_type_id);
    if (q.passage_domain_id) typeIds.add(q.passage_domain_id);
  }
  const { data: types } = typeIds.size
    ? await supabase.from("question_types").select("id, name").in("id", [...typeIds])
    : { data: [] };
  const nameOf = new Map((types ?? []).map((t) => [t.id, t.name]));

  const sets: SetRow[] = (setRows ?? []).map((s) => ({
    mockId: mockOf.get(s.section_attempt_id) ?? "?",
    archetypeId: s.archetype_id,
    archetypeName: one(s.question_types)?.name ?? "Unknown shape",
    chosen: s.chosen,
    selectionOrder: s.selection_order,
    timeSpentSec: s.time_spent_sec,
    marksEarned: Number(s.marks_earned ?? 0),
    numQuestions: s.num_questions,
    verdict: s.solvable_verdict as Verdict | null,
  }));

  const questions: QuestionRow[] = (questionRows ?? []).map((q) => ({
    mockId: mockOf.get(q.section_attempt_id) ?? "?",
    sectionCode: codeOf.get(q.section_attempt_id) ?? "?",
    typeId: q.question_type_id,
    typeName: q.question_type_id ? (nameOf.get(q.question_type_id) ?? null) : null,
    passageDomainId: q.passage_domain_id,
    passageDomainName: q.passage_domain_id ? (nameOf.get(q.passage_domain_id) ?? null) : null,
    responseFormat: q.response_format as "mcq" | "tita",
    timeSpentSec: q.time_spent_sec,
    status: q.status as QuestionRow["status"],
    isCorrect: q.is_correct,
    confidence: q.confidence,
    errorCause: q.error_cause as ErrorCause | null,
    marksEarned: q.marks_earned === null ? null : Number(q.marks_earned),
  }));

  const providers = new Set(
    complete.map((a) => one(a.mock_sources)?.provider).filter(Boolean),
  ).size;

  return {
    mocks,
    sections,
    sets,
    questions,
    scheme,
    providers,
    unfinished,
    practiceMockCount: practiceMocks.length,
  };
}
