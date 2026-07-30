"use client";

import { supabase } from "./supabase/client";

/**
 * Builds the student's full data export in the browser.
 *
 * WHY CLIENT-SIDE. Every query below runs under Row Level Security as the signed
 * in user, so the export can only ever contain their own rows — there is no
 * service-role key involved and no ownership check to get wrong. A server route
 * would need the admin client and would have to re-implement the ownership
 * logic that RLS already enforces.
 *
 * Two formats, deliberately:
 *   JSON — complete and structured. Everything ASHA holds, nothing summarised.
 *   CSV  — one flat row per logged question and per logged set. The target user
 *          already analyses mocks in a spreadsheet they built themselves
 *          (functional-spec), so handing them JSON alone would be technically
 *          complete and practically useless.
 */

type Json = Record<string, unknown>;

async function fetchAll() {
  const [profile, sources, attempts, sections, sets, questions, insights] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("mock_sources").select("*"),
    supabase.from("mock_attempts").select("*"),
    supabase.from("section_attempts").select("*"),
    supabase.from("set_attempts").select("*"),
    supabase.from("question_attempts").select("*"),
    supabase.from("insights").select("*"),
  ]);

  const err =
    profile.error ??
    sources.error ??
    attempts.error ??
    sections.error ??
    sets.error ??
    questions.error ??
    insights.error;
  if (err) throw new Error(err.message);

  // Resolve only the taxonomy nodes actually referenced. The full shared
  // taxonomy is not the student's data and would bloat the file; without any
  // names, though, the export would be a wall of uuids.
  const ids = new Set<string>();
  for (const s of sets.data ?? []) if (s.archetype_id) ids.add(s.archetype_id as string);
  for (const q of questions.data ?? []) {
    if (q.question_type_id) ids.add(q.question_type_id as string);
    if (q.passage_domain_id) ids.add(q.passage_domain_id as string);
  }

  const { data: types } = ids.size
    ? await supabase.from("question_types").select("id, code, name, kind").in("id", [...ids])
    : { data: [] };

  const { data: sectionRefs } = await supabase.from("sections").select("id, code, name, ordinal");

  return {
    profile: profile.data ?? [],
    sources: sources.data ?? [],
    attempts: attempts.data ?? [],
    sections: sections.data ?? [],
    sets: sets.data ?? [],
    questions: questions.data ?? [],
    insights: insights.data ?? [],
    types: types ?? [],
    sectionRefs: sectionRefs ?? [],
  };
}

export async function buildJsonExport(): Promise<string> {
  const d = await fetchAll();
  const payload: Json = {
    exported_at: new Date().toISOString(),
    what_this_is:
      "Everything ASHA holds about you. Timing values are your own recalled estimates entered in buckets, never measurements — see timing_source on each attempt.",
    profile: d.profile,
    mock_sources: d.sources,
    mock_attempts: d.attempts,
    section_attempts: d.sections,
    set_attempts: d.sets,
    question_attempts: d.questions,
    insights: d.insights,
    reference: {
      note: "Only the taxonomy nodes your data refers to, included so the ids above are readable.",
      question_types: d.types,
      sections: d.sectionRefs,
    },
  };
  return JSON.stringify(payload, null, 2);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/**
 * One flat CSV covering both units of logging: a `question` row per question and
 * a `set` row per DILR set. Kept as one file rather than two because a student
 * pivoting this in a spreadsheet wants a single table, and the `row_type` column
 * separates them in one filter.
 */
export async function buildCsvExport(): Promise<string> {
  const d = await fetchAll();

  const nameOf = new Map(d.types.map((t) => [t.id as string, t.name as string]));
  const sectionOf = new Map(d.sectionRefs.map((s) => [s.id as string, s.code as string]));
  const sourceOf = new Map(d.sources.map((s) => [s.id as string, s.title as string]));

  const attemptOf = new Map(
    d.attempts.map((a) => [
      a.id as string,
      {
        title: (a.source_id ? sourceOf.get(a.source_id as string) : null) ?? "Untitled mock",
        takenOn: a.taken_on as string,
        timing: a.timing_source as string,
      },
    ]),
  );

  const sectionAttempt = new Map(
    d.sections.map((s) => [
      s.id as string,
      {
        mock: attemptOf.get(s.mock_attempt_id as string),
        code: sectionOf.get(s.section_id as string) ?? "",
      },
    ]),
  );

  const headers = [
    "row_type",
    "mock",
    "taken_on",
    "section",
    "timing_source",
    "label_or_number",
    "type_or_archetype",
    "passage_subject",
    "response_format",
    "chosen",
    "selection_order",
    "num_questions",
    "num_attempted",
    "num_correct",
    "status",
    "is_correct",
    "confidence",
    "error_cause",
    "time_spent_sec",
    "marks_earned",
    "verdict",
  ];

  const rows: unknown[][] = [];

  for (const s of d.sets) {
    const ctx = sectionAttempt.get(s.section_attempt_id as string);
    rows.push([
      "set",
      ctx?.mock?.title,
      ctx?.mock?.takenOn,
      ctx?.code,
      ctx?.mock?.timing,
      s.label,
      s.archetype_id ? nameOf.get(s.archetype_id as string) : "",
      "",
      "",
      s.chosen,
      s.selection_order,
      s.num_questions,
      s.num_attempted,
      s.num_correct,
      "",
      "",
      "",
      "",
      s.time_spent_sec,
      s.marks_earned,
      s.solvable_verdict,
    ]);
  }

  for (const q of d.questions) {
    const ctx = sectionAttempt.get(q.section_attempt_id as string);
    rows.push([
      "question",
      ctx?.mock?.title,
      ctx?.mock?.takenOn,
      ctx?.code,
      ctx?.mock?.timing,
      q.question_number,
      q.question_type_id ? nameOf.get(q.question_type_id as string) : "",
      q.passage_domain_id ? nameOf.get(q.passage_domain_id as string) : "",
      q.response_format,
      "",
      "",
      "",
      "",
      "",
      q.status,
      q.is_correct,
      q.confidence,
      q.error_cause,
      q.time_spent_sec,
      q.marks_earned,
      "",
    ]);
  }

  // Chronological, then section, so the file reads like the season did.
  rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])));

  return toCsv(headers, rows);
}

/** Triggers a download without a server round-trip. */
export function downloadFile(contents: string, filename: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFilename(ext: "json" | "csv"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `asha-export-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}
