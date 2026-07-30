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
      "id, taken_on, total_score, timing_source, is_complete, mock_sources(title, provider), exam_configs(mark_correct, mark_wrong_mcq, mark_wrong_numeric)",
    )
    .order("taken_on");

  const all = attempts ?? [];
  const complete = all.filter((a) => a.is_complete);

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

  if (mocks.length === 0) {
    return { mocks, sections: [], sets: [], questions: [], scheme, providers: 0, unfinished };
  }

  const mockIds = mocks.map((m) => m.id);

  const { data: sectionAttempts } = await supabase
    .from("section_attempts")
    .select("id, mock_attempt_id, score, quarter_marks, sections(code, ordinal)")
    .in("mock_attempt_id", mockIds);

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

  const sections: SectionRow[] = sa.map((s) => ({
    mockId: s.mock_attempt_id,
    sectionCode: one(s.sections)?.code ?? "?",
    score: s.score === null ? null : Number(s.score),
    quarterMarks: s.quarter_marks as number[] | null,
  }));

  // Guard against an empty `in()`, which PostgREST treats as matching nothing —
  // harmless here, but an explicit early return is clearer than a sentinel uuid.
  if (saIds.length === 0) {
    return { mocks, sections, sets: [], questions: [], scheme, providers: 0, unfinished };
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

  return { mocks, sections, sets, questions, scheme, providers, unfinished };
}
