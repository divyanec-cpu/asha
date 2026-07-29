/**
 * check-analytics.ts — run every analytic against the LIVE database and print
 * what it produces.
 *
 *   node --env-file=.env.local scripts/check-analytics.ts
 *
 * WHY THIS EXISTS ALONGSIDE THE UNIT TESTS. `npm test` proves the arithmetic
 * against hand-built fixtures. It cannot prove the functions are wired to the
 * real row shapes, or that they behave sensibly on real distributions. This
 * script caught a bug the tests missed: expected marks from guessing came back
 * POSITIVE, because guessing a TITA is free — while the field was named
 * `marksLostToGuessing`, so it would have rendered as a loss. Every unit test
 * until then used MCQ guesses only.
 *
 * Read-only. Uses the service-role key, so it sees every user's rows — a local
 * development tool that must never run anywhere else.
 */

import { setSelectionPlaybook, skipRegret } from "../src/lib/analytics/setSelection.ts";
import { calibration, errorCauses, quadrant, timeTraps } from "../src/lib/analytics/questions.ts";
import { pacing, trend } from "../src/lib/analytics/trend.ts";
import type {
  ErrorCause,
  MockRow,
  QuestionRow,
  SectionRow,
  SetRow,
  Verdict,
} from "../src/lib/analytics/types.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

// Raw PostgREST shapes, typed explicitly rather than with `any`: these are the
// same rows the app reads, and a wrong assumption here is exactly the class of
// bug this script exists to catch. Numerics arrive as strings from PostgREST.
type Embedded<T> = T | T[] | null;

type RawMock = {
  id: string;
  taken_on: string;
  total_score: string | number | null;
  timing_source: MockRow["timingSource"];
  mock_sources: Embedded<{ title: string }>;
};
type RawSection = {
  id: string;
  mock_attempt_id: string;
  score: string | number | null;
  quarter_marks: number[] | null;
  sections: Embedded<{ code: string }>;
};
type RawSet = {
  section_attempt_id: string;
  archetype_id: string | null;
  chosen: boolean;
  selection_order: number | null;
  time_spent_sec: number;
  marks_earned: string | number;
  num_questions: number;
  solvable_verdict: Verdict | null;
  question_types: Embedded<{ name: string }>;
};
type RawQuestion = {
  section_attempt_id: string;
  question_type_id: string | null;
  passage_domain_id: string | null;
  response_format: "mcq" | "tita";
  time_spent_sec: number | null;
  status: QuestionRow["status"];
  is_correct: boolean | null;
  confidence: number | null;
  error_cause: ErrorCause | null;
  marks_earned: string | number | null;
};

const one = <T,>(v: Embedded<T>): T | null =>
  v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));
const pct = (n: number) => `${Math.round(n * 100)}%`;

const [mocks, sections, sets, questions, types] = await Promise.all([
  get<RawMock>(
    "mock_attempts?select=id,taken_on,total_score,timing_source,mock_sources(title)&limit=500",
  ),
  get<RawSection>(
    "section_attempts?select=id,mock_attempt_id,score,quarter_marks,sections(code)&limit=1000",
  ),
  get<RawSet>(
    "set_attempts?select=section_attempt_id,archetype_id,chosen,selection_order,time_spent_sec,marks_earned,num_questions,solvable_verdict,question_types(name)&limit=1000",
  ),
  get<RawQuestion>(
    "question_attempts?select=section_attempt_id,question_type_id,passage_domain_id,response_format,time_spent_sec,status,is_correct,confidence,error_cause,marks_earned&limit=5000",
  ),
  get<{ id: string; name: string }>("question_types?select=id,name&limit=500"),
]);

const nameOf = new Map(types.map((t) => [t.id, t.name]));
const mockOfSection = new Map(sections.map((s) => [s.id, s.mock_attempt_id]));
const codeOfSection = new Map(sections.map((s) => [s.id, one(s.sections)?.code ?? "?"]));

const setRows: SetRow[] = sets.map((s) => ({
  mockId: mockOfSection.get(s.section_attempt_id) ?? "?",
  archetypeId: s.archetype_id,
  archetypeName: one(s.question_types)?.name ?? "Unknown shape",
  chosen: s.chosen,
  selectionOrder: s.selection_order,
  timeSpentSec: s.time_spent_sec,
  marksEarned: Number(s.marks_earned),
  numQuestions: s.num_questions,
  verdict: s.solvable_verdict,
}));

const questionRows: QuestionRow[] = questions.map((q) => ({
  mockId: mockOfSection.get(q.section_attempt_id) ?? "?",
  sectionCode: codeOfSection.get(q.section_attempt_id) ?? "?",
  typeId: q.question_type_id,
  typeName: q.question_type_id ? (nameOf.get(q.question_type_id) ?? null) : null,
  passageDomainId: q.passage_domain_id,
  passageDomainName: q.passage_domain_id ? (nameOf.get(q.passage_domain_id) ?? null) : null,
  responseFormat: q.response_format,
  timeSpentSec: q.time_spent_sec,
  status: q.status,
  isCorrect: q.is_correct,
  confidence: q.confidence,
  errorCause: q.error_cause,
  marksEarned: num(q.marks_earned),
}));

const sectionRows: SectionRow[] = sections.map((s) => ({
  mockId: s.mock_attempt_id,
  sectionCode: one(s.sections)?.code ?? "?",
  score: num(s.score),
  quarterMarks: s.quarter_marks,
}));

const mockRows: MockRow[] = mocks.map((m) => ({
  id: m.id,
  takenOn: m.taken_on,
  title: one(m.mock_sources)?.title ?? "Untitled",
  totalScore: num(m.total_score),
  timingSource: m.timing_source,
}));

// The app reads the marking scheme from exam_configs. Hardcoded here only
// because this is a diagnostic and CAT is the one seeded exam.
const CAT = { markCorrect: 3, markWrongMcq: -1, markWrongNumeric: 0 };
const BUCKETS = [30, 90, 180, 300];

console.log(
  `\ndata: ${mockRows.length} mocks · ${setRows.length} sets · ${questionRows.length} question rows\n`,
);

console.log("SET-SELECTION PLAYBOOK");
for (const c of setSelectionPlaybook(setRows)) {
  if (c.status === "ok") {
    console.log(
      `  ${c.data.archetypeName.slice(0, 24).padEnd(25)} ${c.data.recommendation.padEnd(14)}` +
        ` clear=${pct(c.data.clearRate ?? 0).padStart(4)}  m/min=${String(c.data.marksPerMinute).padStart(5)}` +
        `  n=${c.supportingN} ${c.confidence}`,
    );
  } else {
    console.log(`  [locked] n=${c.supportingN} — ${c.message}`);
  }
}

const regret = skipRegret(setRows);
console.log(
  `\nSKIP REGRET: ${
    regret.status === "ok"
      ? `${regret.data.wouldHaveCleared} of ${regret.data.skippedSets} walked past would have cleared,` +
        ` across ${regret.data.mocksCovered} mocks (n=${regret.supportingN}, ${regret.confidence})`
      : regret.message
  }`,
);

const cal = calibration(questionRows, CAT);
console.log(`\nCALIBRATION: ${cal.status}`);
if (cal.status === "ok") {
  for (const l of cal.data.levels) {
    console.log(
      `  ${l.label.padEnd(9)} n=${String(l.tagged).padStart(3)}  right=${pct(l.accuracy)}`,
    );
  }
  console.log(
    `  confident-and-wrong=${cal.data.confidentAndWrong}  guessed-and-right=${cal.data.guessedAndRight}`,
  );
  console.log(
    `  expected marks from guessing=${cal.data.expectedMarksFromGuessing} (negative = costing)`,
  );
  console.log(
    `  costsMarks=${cal.data.guessingCostsMarks}  marginal=${cal.data.guessingIsMarginal}  breakeven=${cal.data.breakevenAccuracy}`,
  );
}

console.log("\nQUADRANT (live only)");
for (const c of quadrant(questionRows)) {
  if (c.status !== "ok") continue;
  console.log(
    `  ${c.data.typeName.slice(0, 22).padEnd(23)} ${String(c.data.quadrant).padEnd(11)}` +
      ` acc=${pct(c.data.accuracy).padStart(4)}  mean=${Math.round(c.data.meanSec ?? 0)}s  n=${c.supportingN}`,
  );
}

console.log("\nTIME TRAPS");
const traps = timeTraps(questionRows, BUCKETS).filter((c) => c.status === "ok");
if (traps.length === 0) console.log("  none — no type shows outlier-slow attempts");
for (const c of traps) {
  if (c.status !== "ok") continue;
  console.log(
    `  ${c.data.typeName.slice(0, 22).padEnd(23)} ${c.data.inSlowestBucket} of ${c.data.attempts} in top bucket,` +
      ` right ${pct(c.data.accuracyWhenSlow ?? 0)} of the time (median ${c.data.medianSec}s)`,
  );
}

console.log("\nERROR CAUSES");
for (const c of errorCauses(questionRows)) {
  console.log(
    c.status === "ok"
      ? `  ${c.data.sectionCode}: dominant=${c.data.dominant}  not-conceptual=${pct(c.data.notConceptualShare)}  n=${c.supportingN}`
      : `  [locked] ${c.message}`,
  );
}

console.log("\nPACING");
for (const c of pacing(sectionRows)) {
  console.log(
    c.status === "ok"
      ? `  ${c.data.sectionCode}: quarters=[${c.data.meanByQuarter.join(", ")}]` +
          ` weakest=Q${c.data.weakestQuarter + 1} recovers=${c.data.recovers} n=${c.supportingN}`
      : `  [locked] ${c.message}`,
  );
}

const providers = new Set(mockRows.map((m) => m.title.replace(/[\d\[\]]/g, "").trim())).size;
const tr = trend(mockRows, providers);
console.log(
  `\nTREND: ${
    tr.status === "ok"
      ? `centre=${tr.data.centre}` +
        ` spread=${tr.data.spread === null ? "null (needs 5 mocks)" : `±${tr.data.spread}`}` +
        ` delta-vs-last-3=${tr.data.deltaVsPreviousThree} points=${tr.data.points.length}` +
        ` trendline=${tr.data.trendline}`
      : tr.message
  }\n`,
);
