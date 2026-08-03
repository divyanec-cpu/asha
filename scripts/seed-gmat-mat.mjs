/**
 * seed-gmat-mat.mjs
 *
 * Seeds the GMAT and MAT exam rows, their marking configs, sections, and a
 * question-type taxonomy for each. v3 scope item 2 (CLAUDE.md).
 *
 * Run with the SERVICE ROLE key — these are shared reference tables with no write
 * policy.
 *
 *   node scripts/seed-gmat-mat.mjs
 *
 * REQUIRES migrations 0001-0008. Idempotent: upserts on natural keys, and asserts
 * its own result against the live database rather than merely printing it.
 *
 * ─── BOTH EXAMS ARE SEEDED INACTIVE ──────────────────────────────────────────
 *
 * `active = false`, so the profile form lists them as "GMAT — soon" instead of
 * offering them. CLAUDE.md's v3 entry opens "GMAT and MAT configs. Seed data
 * only: exam rows, exam_configs marking per pattern, sections, and a taxonomy per
 * exam." Seed data, not UI. Flipping `active` is a one-row update when the
 * remaining questions below are settled.
 *
 * ─── WHY THE GMAT MARKING NUMBERS ARE NOT GMAT SCORING ───────────────────────
 *
 * READ THIS BEFORE TRUSTING ANY GMAT FIGURE ASHA SHOWS.
 *
 * The GMAT Focus Edition is computer-adaptive and scored by item response theory:
 * a question's contribution depends on its difficulty and on the whole response
 * pattern. Total scores run 205-805, section scores 60-90. **There is no
 * per-question mark, and no arithmetic over per-question marks can reproduce a
 * GMAT score.**
 *
 * `exam_configs.mark_correct / mark_wrong_mcq / mark_wrong_numeric` are NOT NULL,
 * so the row cannot simply decline to answer. It is seeded 1 / 0 / 0, which is
 * true to the exam in the one sense that matters — GMAT has no negative marking —
 * and makes `marks_earned` a **raw count of correct answers**.
 *
 * That count is honest as a count. It is NOT a GMAT score and must never be
 * displayed as one, and marks-per-minute for GMAT reads as "correct answers per
 * minute", not marks. The student's actual 205-805 score belongs in
 * `mock_attempts.total_score`, where it is reported from their mock platform and
 * never computed. This is why the exam ships inactive: no screen has yet been
 * checked for wording that would present a raw-correct count as a score.
 *
 * ─── WHY NEITHER EXAM GETS SET ARCHETYPES ────────────────────────────────────
 *
 * ASHA decides set-based vs question-based logging per SECTION, by whether the
 * section owns `set_archetype` nodes. That is a section-level switch with no
 * mixed mode.
 *
 *   GMAT Data Insights contains Multi-Source Reasoning, which is set-shaped. But
 *   DI also contains four standalone types, and the whole exam is adaptive — you
 *   cannot scan the section and choose which sets to take. The DILR set-selection
 *   engine answers "which sets should I pick?", a question the GMAT does not let
 *   you ask.
 *
 *   MAT Data Analysis & Sufficiency genuinely does present 4-5 DI sets, and MAT
 *   has no sectional clock, so set selection IS a real skill there. Archetypes
 *   would nonetheless force the entire section to log by set, leaving its 8-10
 *   standalone Data Sufficiency questions with nowhere to go. Question-level
 *   logging keeps everything loggable; MAT set selection needs a mixed-mode
 *   section, which is a schema change and not this task.
 *
 * ─── SOURCES, AND WHAT DISAGREED ─────────────────────────────────────────────
 *
 * CLAUDE.md: "Each pattern must be independently verified before seeding, because
 * a wrong marking rule silently corrupts every figure for that exam." So:
 *
 * MAT — the coaching sites are split. Several still publish the OLD pattern:
 * 200 questions, 40 per section, 150 minutes, and a fifth section called "Indian
 * & Global Environment". AIMA's own site gives 150 questions, 30 per section, 120
 * minutes, and the fifth section RENAMED to "Economic & Business Environment"
 * (the "MAT 2.0" revision). The official figures are seeded. If a MAT denominator
 * ever looks wrong, this is the first thing to re-check.
 *
 * MAT's fifth section — one unresolved conflict, seeded conservatively. AIMA's
 * page says all five sections count toward the MAT score; the coaching consensus
 * says the section is scored but excluded from the percentile, with some colleges
 * still looking at it. Since the admissions-relevant number is the percentile,
 * `counts_toward_score = false` is seeded for EBE. Nothing in ASHA reads that
 * column yet, so this is a recorded position rather than a live behaviour.
 *
 * GMAT — 3 sections, 64 questions, 135 minutes, 45 per section, sections in any
 * order, up to 3 answer changes per section, no negative marking. Data
 * Sufficiency moved OUT of Quant into Data Insights; Sentence Correction and
 * Geometry were removed outright, which is why no Geometry node appears under
 * Quantitative Reasoning and no Sentence Correction node under Verbal.
 */

import { createClient } from '@supabase/supabase-js';

// Same environment guard as seed-cat-taxonomy.mjs. Deliberately duplicated rather
// than extracted: that script is verified against a live database and seeding is
// the one place where a refactor's blast radius is a silently wrong reference
// table.
const MISSING = [
  ['SUPABASE_URL', 'Project Settings → API → Project URL (same value as NEXT_PUBLIC_SUPABASE_URL)'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API → service_role key (the secret one, NOT anon)'],
].filter(([name]) => !process.env[name]?.trim());

if (MISSING.length) {
  console.error('\n  SEED FAILED: missing environment variables in .env.local\n');
  for (const [name, where] of MISSING) console.error(`    ${name}\n      ${where}\n`);
  console.error('  Copy .env.local.example to .env.local and fill in the Supabase block.\n');
  process.exit(1);
}

// SUPABASE_URL must be the bare origin — supabase-js appends '/rest/v1/<table>'
// itself, and a URL carrying a path yields PGRST125 "Invalid path specified in
// request URL", which says nothing about the real cause.
{
  const raw = process.env.SUPABASE_URL.trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`\n  SEED FAILED: SUPABASE_URL is not a valid URL: ${raw}\n`);
    process.exit(1);
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    console.error('\n  SEED FAILED: SUPABASE_URL must be the bare origin, with no path.\n');
    console.error(`    got:      ${raw}`);
    console.error(`    expected: ${parsed.protocol}//${parsed.hostname}\n`);
    console.error('  Use the Project URL from Settings → Data API, not the RESTful endpoint.\n');
    process.exit(1);
  }
}

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── GMAT ────────────────────────────────────────────────────────────────────

const GMAT = {
  exam: {
    code: 'GMAT',
    name: 'Graduate Management Admission Test (Focus Edition)',
    adaptive: true,
    active: false,
  },

  config: {
    effective_year: 2026,
    total_questions: 64,
    total_time_min: 135,
    // See the header. These are NOT GMAT scoring; they make marks_earned a
    // raw-correct count, and the only exam-true fact encoded here is that GMAT
    // applies no penalty for a wrong answer.
    mark_correct: 1.0,
    mark_wrong_mcq: 0.0,
    mark_wrong_numeric: 0.0,
    // Sections may be taken in any of the six possible orders.
    section_order_fixed: false,
    // Up to three answers may be changed per section during review. This is the
    // column's original purpose — the 0002 comment already says "GMAT: 3 per
    // section".
    review_edit_limit: 3,
    // Not an XAT-style scored penalty. GMAT's adaptive algorithm treats unseen
    // questions as heavily unfavourable, but that is a scoring-model effect, not
    // a per-question deduction, and encoding it as one would be a fabrication.
    unattempted_penalty: null,
    notes:
      'GMAT Focus Edition. 3 sections x 45 min = 135 min, 64 questions, sections in any '
      + 'order, up to 3 answer changes per section. ADAPTIVE with IRT scoring (total '
      + '205-805, sections 60-90), so there are NO per-question marks: mark_correct=1 / '
      + 'wrong=0 makes marks_earned a RAW COUNT OF CORRECT ANSWERS, not a GMAT score, and '
      + 'marks-per-minute reads as correct-answers-per-minute. The real score is reported '
      + 'by the student into mock_attempts.total_score and is never computed. Data '
      + 'Sufficiency sits in Data Insights, not Quant; Sentence Correction and Geometry '
      + 'are not part of the Focus Edition. Seeded inactive - see scripts/seed-gmat-mat.mjs.',
  },

  sections: [
    { code: 'QR', name: 'Quantitative Reasoning', ordinal: 1, time_limit_min: 45, question_count: 21, has_own_timer: true,  counts_toward_score: true },
    { code: 'VR', name: 'Verbal Reasoning',       ordinal: 2, time_limit_min: 45, question_count: 23, has_own_timer: true,  counts_toward_score: true },
    { code: 'DI', name: 'Data Insights',          ordinal: 3, time_limit_min: 45, question_count: 20, has_own_timer: true,  counts_toward_score: true },
  ],

  taxonomy: {
    QR: [
      {
        code: 'GMAT.QR.PS', name: 'Problem Solving',
        description: 'The only question format in Focus Edition Quant — Data Sufficiency moved to '
                   + 'Data Insights. Geometry is not tested.',
        children: [
          { code: 'GMAT.QR.PS.NUM',   name: 'Number properties' },
          { code: 'GMAT.QR.PS.FRAC',  name: 'Fractions, decimals & percentages' },
          { code: 'GMAT.QR.PS.RATIO', name: 'Ratio & proportion' },
          { code: 'GMAT.QR.PS.RATE',  name: 'Rates, speed & work' },
          { code: 'GMAT.QR.PS.STAT',  name: 'Statistics — mean, median, range, SD' },
          { code: 'GMAT.QR.PS.SETS',  name: 'Sets & counting' },
          { code: 'GMAT.QR.PS.PROB',  name: 'Probability' },
          { code: 'GMAT.QR.PS.LIN',   name: 'Linear equations & inequalities' },
          { code: 'GMAT.QR.PS.QUAD',  name: 'Quadratic equations' },
          { code: 'GMAT.QR.PS.EXP',   name: 'Exponents & roots' },
          { code: 'GMAT.QR.PS.FUNC',  name: 'Functions & sequences' },
          { code: 'GMAT.QR.PS.WORD',  name: 'Algebraic word problems' },
        ],
      },
    ],

    VR: [
      {
        code: 'GMAT.VR.RC', name: 'Reading Comprehension',
        children: [
          { code: 'GMAT.VR.RC.MAIN',   name: 'Main idea / primary purpose' },
          { code: 'GMAT.VR.RC.DETAIL', name: 'Supporting detail' },
          { code: 'GMAT.VR.RC.INFER',  name: 'Inference' },
          { code: 'GMAT.VR.RC.FUNC',   name: 'Function of a statement' },
          { code: 'GMAT.VR.RC.TONE',   name: 'Author’s tone & attitude' },
        ],
      },
      {
        code: 'GMAT.VR.CR', name: 'Critical Reasoning',
        description: 'Sentence Correction is not part of the Focus Edition, so Verbal is '
                   + 'Reading Comprehension and Critical Reasoning only.',
        children: [
          { code: 'GMAT.VR.CR.ASSUMP',     name: 'Assumption' },
          { code: 'GMAT.VR.CR.STRENGTHEN', name: 'Strengthen the argument' },
          { code: 'GMAT.VR.CR.WEAKEN',     name: 'Weaken the argument' },
          { code: 'GMAT.VR.CR.INFER',      name: 'Inference / conclusion' },
          { code: 'GMAT.VR.CR.EVAL',       name: 'Evaluate the argument' },
          { code: 'GMAT.VR.CR.FLAW',       name: 'Flaw in the reasoning' },
          { code: 'GMAT.VR.CR.PARADOX',    name: 'Resolve the paradox' },
          { code: 'GMAT.VR.CR.ROLE',       name: 'Role of a boldfaced statement' },
        ],
      },
    ],

    // The five formats GMAC names for Data Insights. Kept as question types, not
    // set archetypes — see the header for why.
    DI: [
      { code: 'GMAT.DI.DS',  name: 'Data Sufficiency',
        description: 'Moved here from Quant in the Focus Edition.' },
      { code: 'GMAT.DI.MSR', name: 'Multi-Source Reasoning' },
      { code: 'GMAT.DI.TA',  name: 'Table Analysis' },
      { code: 'GMAT.DI.GI',  name: 'Graphics Interpretation' },
      { code: 'GMAT.DI.TPA', name: 'Two-Part Analysis' },
    ],
  },

  expect: {
    sections: 3,
    nodesBySection: { QR: 13, VR: 15, DI: 5 },
    nodesTotal: 33,
    byKind: { question_type: 33, set_archetype: 0, passage_domain: 0 },
  },
};

// ─── MAT ─────────────────────────────────────────────────────────────────────

const MAT = {
  exam: {
    code: 'MAT',
    name: 'Management Aptitude Test',
    adaptive: false,
    active: false,
  },

  config: {
    effective_year: 2026,
    total_questions: 150,
    total_time_min: 120,
    mark_correct: 1.0,
    mark_wrong_mcq: -0.25,
    // MAT is entirely multiple choice — it has no TITA/numeric-entry format at
    // all. Set equal to the MCQ penalty rather than 0 so that a stray numeric row
    // can never look like a penalty-free guessing route the exam does not offer.
    mark_wrong_numeric: -0.25,
    // No sectional clock: 120 minutes across all five sections, moving freely.
    section_order_fixed: false,
    review_edit_limit: null,
    unattempted_penalty: null,
    notes:
      'MAT ("MAT 2.0" revision) per AIMA: 150 questions, 5 sections x 30, 120 minutes '
      + 'total with NO sectional time limit — the student moves between sections freely, '
      + 'which is why every section row has time_limit_min = null and has_own_timer = '
      + 'false. Marking +1 / -0.25 / 0 unattempted, all MCQ. NOTE: many coaching sites '
      + 'still publish the superseded 200-question / 40-per-section / 150-minute pattern '
      + 'with the fifth section named "Indian & Global Environment"; it was renamed '
      + '"Economic & Business Environment". EBE carries counts_toward_score = false '
      + 'because it is excluded from the MAT percentile, though AIMA describes it as '
      + 'scored and some colleges consider it at selection. Seeded inactive - see '
      + 'scripts/seed-gmat-mat.mjs.',
  },

  // Order follows AIMA's own listing. With no sectional clock and no fixed order,
  // ordinal is display order only.
  sections: [
    { code: 'LC',  name: 'Language Comprehension',            ordinal: 1, time_limit_min: null, question_count: 30, has_own_timer: false, counts_toward_score: true },
    { code: 'ICR', name: 'Intelligence & Critical Reasoning', ordinal: 2, time_limit_min: null, question_count: 30, has_own_timer: false, counts_toward_score: true },
    { code: 'MS',  name: 'Mathematical Skills',               ordinal: 3, time_limit_min: null, question_count: 30, has_own_timer: false, counts_toward_score: true },
    { code: 'DAS', name: 'Data Analysis & Sufficiency',       ordinal: 4, time_limit_min: null, question_count: 30, has_own_timer: false, counts_toward_score: true },
    { code: 'EBE', name: 'Economic & Business Environment',   ordinal: 5, time_limit_min: null, question_count: 30, has_own_timer: false, counts_toward_score: false },
  ],

  taxonomy: {
    LC: [
      {
        code: 'MAT.LC.RC', name: 'Reading Comprehension',
        children: [
          { code: 'MAT.LC.RC.MAIN',   name: 'Main idea / central theme' },
          { code: 'MAT.LC.RC.INFER',  name: 'Inference' },
          { code: 'MAT.LC.RC.DETAIL', name: 'Specific detail' },
          { code: 'MAT.LC.RC.VOCAB',  name: 'Vocabulary in context' },
          { code: 'MAT.LC.RC.TONE',   name: 'Tone & attitude' },
        ],
      },
      {
        code: 'MAT.LC.VA', name: 'Verbal Ability',
        children: [
          { code: 'MAT.LC.VA.SYNANT', name: 'Synonyms & antonyms' },
          { code: 'MAT.LC.VA.FILL',   name: 'Fill in the blanks' },
          { code: 'MAT.LC.VA.ERROR',  name: 'Error spotting & sentence correction' },
          { code: 'MAT.LC.VA.JUMBLE', name: 'Para jumbles' },
          { code: 'MAT.LC.VA.IDIOM',  name: 'Idioms & phrases' },
          { code: 'MAT.LC.VA.ONEWORD', name: 'One-word substitution' },
        ],
      },
    ],

    ICR: [
      { code: 'MAT.ICR.ARR',    name: 'Arrangements & seating' },
      { code: 'MAT.ICR.BLOOD',  name: 'Blood relations' },
      { code: 'MAT.ICR.DIR',    name: 'Direction sense' },
      { code: 'MAT.ICR.SERIES', name: 'Series & analogies' },
      { code: 'MAT.ICR.CODING', name: 'Coding & decoding' },
      { code: 'MAT.ICR.SYLL',   name: 'Syllogisms' },
      { code: 'MAT.ICR.STMT',   name: 'Statement & conclusion / assumption' },
      { code: 'MAT.ICR.PUZZLE', name: 'Puzzles' },
      { code: 'MAT.ICR.CRIT',   name: 'Critical reasoning' },
    ],

    MS: [
      {
        code: 'MAT.MS.ARITH', name: 'Arithmetic',
        description: 'Roughly 40-50% of the section by most coaching analyses — directional, '
                   + 'not official.',
        children: [
          { code: 'MAT.MS.ARITH.PERCENT', name: 'Percentages' },
          { code: 'MAT.MS.ARITH.RATIO',   name: 'Ratio, proportion & partnership' },
          { code: 'MAT.MS.ARITH.TSD',     name: 'Time, speed & distance' },
          { code: 'MAT.MS.ARITH.WORK',    name: 'Time & work' },
          { code: 'MAT.MS.ARITH.PROFIT',  name: 'Profit, loss & discount' },
          { code: 'MAT.MS.ARITH.INTEREST', name: 'Simple & compound interest' },
          { code: 'MAT.MS.ARITH.AVG',     name: 'Averages, mixtures & alligation' },
        ],
      },
      {
        code: 'MAT.MS.ALG', name: 'Algebra & numbers',
        children: [
          { code: 'MAT.MS.ALG.EQN',  name: 'Linear & quadratic equations' },
          { code: 'MAT.MS.ALG.PROG', name: 'Progressions' },
          { code: 'MAT.MS.ALG.NUM',  name: 'Number system' },
        ],
      },
      {
        code: 'MAT.MS.GEO', name: 'Geometry & mensuration',
        children: [
          { code: 'MAT.MS.GEO.LINES',  name: 'Lines, angles & triangles' },
          { code: 'MAT.MS.GEO.CIRCLE', name: 'Circles & polygons' },
          { code: 'MAT.MS.GEO.MENS',   name: 'Mensuration' },
          { code: 'MAT.MS.GEO.COORD',  name: 'Coordinate geometry' },
        ],
      },
      {
        code: 'MAT.MS.MOD', name: 'Modern maths',
        children: [
          { code: 'MAT.MS.MOD.PNC',  name: 'Permutations & combinations' },
          { code: 'MAT.MS.MOD.PROB', name: 'Probability' },
          { code: 'MAT.MS.MOD.SETS', name: 'Set theory' },
        ],
      },
    ],

    // Logged question by question, not set by set — see the header.
    DAS: [
      { code: 'MAT.DAS.TABLE',   name: 'Tables' },
      { code: 'MAT.DAS.BAR',     name: 'Bar charts' },
      { code: 'MAT.DAS.LINE',    name: 'Line graphs' },
      { code: 'MAT.DAS.PIE',     name: 'Pie charts' },
      { code: 'MAT.DAS.CASELET', name: 'Caselets' },
      { code: 'MAT.DAS.MIXED',   name: 'Mixed / combination charts' },
      { code: 'MAT.DAS.DS',      name: 'Data sufficiency' },
      { code: 'MAT.DAS.COMPARE', name: 'Data comparison' },
    ],

    EBE: [
      { code: 'MAT.EBE.ECON',     name: 'Economic concepts & policy' },
      { code: 'MAT.EBE.BUSINESS', name: 'Corporate & business developments' },
      { code: 'MAT.EBE.FINANCE',  name: 'Finance & banking terms' },
      { code: 'MAT.EBE.INTL',     name: 'International organisations & trade' },
      { code: 'MAT.EBE.CURRENT',  name: 'Current affairs' },
      { code: 'MAT.EBE.STATIC',   name: 'Static GK — awards, books, brands' },
    ],
  },

  expect: {
    sections: 5,
    nodesBySection: { LC: 13, ICR: 9, MS: 21, DAS: 8, EBE: 6 },
    nodesTotal: 57,
    byKind: { question_type: 57, set_archetype: 0, passage_domain: 0 },
  },
};

const EXAMS = [GMAT, MAT];

// ─── Assertions ──────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`\n  SEED FAILED: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertCount(label, actual, expected) {
  assert(actual === expected, `${label}: expected ${expected}, found ${actual}`);
  console.log(`  ok  ${label}: ${actual}`);
}

function flatten(nodes, sectionCode, out = []) {
  for (const node of nodes) {
    out.push({
      code: node.code,
      sectionCode,
      kind: node.kind ?? 'question_type',
      isLeaf: !(Array.isArray(node.children) && node.children.length > 0),
    });
    if (node.children?.length) flatten(node.children, sectionCode, out);
  }
  return out;
}

// Runs BEFORE touching the database. A duplicated code would otherwise be
// resolved silently by upsert, overwriting the first row and losing a node with
// no error anywhere.
function verifyLiteral(spec) {
  const { exam, config, sections, taxonomy, expect } = spec;
  console.log(`checking the ${exam.code} literal...`);

  const all = Object.entries(taxonomy)
    .flatMap(([sectionCode, roots]) => flatten(roots, sectionCode));

  const seen = new Set();
  for (const node of all) {
    if (seen.has(node.code)) {
      fail(`duplicate code '${node.code}' — upsert would silently overwrite the first one`);
    }
    seen.add(node.code);
  }

  assertCount(`${exam.code} literal nodes`, all.length, expect.nodesTotal);

  for (const [sectionCode, expected] of Object.entries(expect.nodesBySection)) {
    assertCount(
      `${exam.code} literal ${sectionCode} nodes`,
      all.filter(n => n.sectionCode === sectionCode).length,
      expected,
    );
  }

  for (const [kind, expected] of Object.entries(expect.byKind)) {
    assertCount(
      `${exam.code} literal kind=${kind}`,
      all.filter(n => n.kind === kind).length,
      expected,
    );
  }

  // Only leaves are selectable when logging, so a grouping node carrying a
  // tagging kind would be unreachable.
  for (const node of all) {
    if (node.kind !== 'question_type' && !node.isLeaf) {
      fail(`'${node.code}' has kind='${node.kind}' but is a grouping node — nothing could select it`);
    }
  }

  // Every taxonomy key must be a real section, or its nodes would be seeded
  // against the wrong section id.
  const sectionCodes = new Set(sections.map(s => s.code));
  for (const key of Object.keys(taxonomy)) {
    assert(sectionCodes.has(key), `${exam.code} taxonomy references unknown section '${key}'`);
  }

  // A wrong question count is a wrong denominator on every accuracy figure for
  // the exam, so it is caught here rather than months later.
  const declared = sections.reduce((sum, s) => sum + s.question_count, 0);
  assertCount(
    `${exam.code} section question_count sum vs exam_config.total_questions`,
    declared, config.total_questions,
  );

  // A section with no clock must not also claim to own a timer. TimedRunner keys
  // its countdown off time_limit_min, and the two fields disagreeing is how a
  // fabricated limit gets displayed.
  for (const s of sections) {
    if (s.time_limit_min === null && s.has_own_timer) {
      fail(`${exam.code}.${s.code} has no time_limit_min but has_own_timer = true`);
    }
    if (s.time_limit_min !== null && !s.has_own_timer) {
      fail(`${exam.code}.${s.code} has a time_limit_min but has_own_timer = false`);
    }
  }

  // Sectional limits, where they exist, must fit inside the overall limit.
  const sectionalTotal = sections.reduce((sum, s) => sum + (s.time_limit_min ?? 0), 0);
  assert(
    sectionalTotal <= config.total_time_min,
    `${exam.code} sectional limits sum to ${sectionalTotal} min, over the `
    + `${config.total_time_min} min total`,
  );

  console.log(`${exam.code} literal ok\n`);
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function upsertExam(exam) {
  const { data, error } = await db.from('exams')
    .upsert(exam, { onConflict: 'code' }).select().single();
  if (error) throw error;
  return data;
}

async function upsertConfig(examId, config) {
  const { error } = await db.from('exam_configs')
    .upsert({ ...config, exam_id: examId }, { onConflict: 'exam_id,effective_year' });
  if (error) throw error;
}

async function upsertSections(examId, sections) {
  const rows = sections.map(s => ({ ...s, exam_id: examId }));
  const { data, error } = await db.from('sections')
    .upsert(rows, { onConflict: 'exam_id,code' }).select();
  if (error) throw error;
  return Object.fromEntries(data.map(s => [s.code, s.id]));
}

async function upsertNode(node, { examId, sectionId, parentId, depth, sortOrder }) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const row = {
    exam_id: examId,
    section_id: sectionId,
    parent_id: parentId,
    code: node.code,
    name: node.name,
    kind: node.kind ?? 'question_type',
    depth,
    is_leaf: !hasChildren,
    description: node.description ?? null,
    sort_order: sortOrder,
    active: true,
  };
  const { data, error } = await db.from('question_types')
    .upsert(row, { onConflict: 'exam_id,code' }).select().single();
  if (error) throw error;

  if (hasChildren) {
    for (const [i, child] of node.children.entries()) {
      await upsertNode(child, {
        examId, sectionId, parentId: data.id, depth: depth + 1, sortOrder: i,
      });
    }
  }
  return data;
}

// ─── Verification against the live database ──────────────────────────────────
// Re-read rather than trust the write loop: a partial failure, a stale row from an
// earlier revision, or an upsert that merged two nodes all look fine from the
// writer's side and wrong from here.

async function countRows(table, filters) {
  let query = db.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function verifyDatabase(spec, examId, sectionIds) {
  const { exam, config, sections, taxonomy, expect } = spec;
  console.log(`\nverifying ${exam.code} against the database...`);

  assertCount(`db ${exam.code} sections`,
    await countRows('sections', { exam_id: examId }), expect.sections);

  assertCount(`db ${exam.code} nodes total`,
    await countRows('question_types', { exam_id: examId }), expect.nodesTotal);

  for (const [sectionCode, expected] of Object.entries(expect.nodesBySection)) {
    assertCount(`db ${exam.code} ${sectionCode} nodes`,
      await countRows('question_types', { exam_id: examId, section_id: sectionIds[sectionCode] }),
      expected);
  }

  for (const [kind, expected] of Object.entries(expect.byKind)) {
    assertCount(`db ${exam.code} kind=${kind}`,
      await countRows('question_types', { exam_id: examId, kind }), expected);
  }

  const expectedRoots = Object.values(taxonomy).reduce((n, r) => n + r.length, 0);
  const { data: roots, error: rootError } = await db.from('question_types')
    .select('code').eq('exam_id', examId).is('parent_id', null);
  if (rootError) throw rootError;
  assertCount(`db ${exam.code} root nodes`, roots.length, expectedRoots);

  // Read the marking row back and compare field by field. This is the row every
  // marks figure for the exam is computed from, so "the upsert returned no error"
  // is not good enough — numeric(4,2) comes back as a string, hence Number().
  const { data: cfg, error: cfgError } = await db.from('exam_configs')
    .select('*').eq('exam_id', examId).eq('effective_year', config.effective_year).single();
  if (cfgError) throw cfgError;

  for (const field of ['total_questions', 'total_time_min', 'mark_correct',
                       'mark_wrong_mcq', 'mark_wrong_numeric', 'review_edit_limit']) {
    const expected = config[field];
    const actual = cfg[field] === null ? null : Number(cfg[field]);
    assert(actual === expected,
      `db ${exam.code} config.${field}: expected ${expected}, found ${actual}`);
  }
  console.log(`  ok  db ${exam.code} marking config matches the literal`);

  assert(cfg.section_order_fixed === config.section_order_fixed,
    `db ${exam.code} config.section_order_fixed: expected ${config.section_order_fixed}`);

  // The section flags that decide whether a countdown is shown at all.
  const { data: dbSections, error: secError } = await db.from('sections')
    .select('code, time_limit_min, question_count, has_own_timer, counts_toward_score')
    .eq('exam_id', examId);
  if (secError) throw secError;

  for (const want of sections) {
    const got = dbSections.find(s => s.code === want.code);
    assert(got, `db ${exam.code} section ${want.code} missing`);
    for (const field of ['time_limit_min', 'question_count', 'has_own_timer',
                         'counts_toward_score']) {
      assert(got[field] === want[field],
        `db ${exam.code}.${want.code}.${field}: expected ${want[field]}, found ${got[field]}`);
    }
  }
  console.log(`  ok  db ${exam.code} section rows match the literal`);

  // The exam must stay inactive: seeding a UI-visible exam is not what v3 opened,
  // and for GMAT it would expose a raw-correct count on screens whose wording has
  // not been checked.
  const { data: examRow, error: examError } = await db.from('exams')
    .select('active, adaptive').eq('id', examId).single();
  if (examError) throw examError;
  assert(examRow.active === false,
    `db ${exam.code}.active is true — this seed ships config only, not UI`);
  assert(examRow.adaptive === exam.adaptive,
    `db ${exam.code}.adaptive: expected ${exam.adaptive}, found ${examRow.adaptive}`);
  console.log(`  ok  db ${exam.code} is seeded inactive, adaptive=${examRow.adaptive}`);

  console.log(`${exam.code} database ok`);
}

async function seedExam(spec) {
  const exam = await upsertExam(spec.exam);
  console.log(`\nexam: ${exam.code}`);

  await upsertConfig(exam.id, spec.config);
  console.log(`config: ${spec.config.effective_year}`);

  const sectionIds = await upsertSections(exam.id, spec.sections);
  console.log(`sections: ${Object.keys(sectionIds).join(', ')}`);

  for (const [sectionCode, roots] of Object.entries(spec.taxonomy)) {
    for (const [i, root] of roots.entries()) {
      await upsertNode(root, {
        examId: exam.id,
        sectionId: sectionIds[sectionCode],
        parentId: null,
        depth: 0,
        sortOrder: i,
      });
    }
    console.log(`  ${sectionCode}: written`);
  }

  await verifyDatabase(spec, exam.id, sectionIds);
}

async function main() {
  // Every literal is checked before anything is written, so a counting mistake in
  // MAT does not leave GMAT half-seeded.
  for (const spec of EXAMS) verifyLiteral(spec);

  for (const spec of EXAMS) await seedExam(spec);

  // CAT must be untouched. These tables are shared, and a stray edit to the one
  // active exam is the worst outcome this script could have.
  const { data: cat, error: catError } = await db.from('exams')
    .select('id, active').eq('code', 'CAT').maybeSingle();
  if (catError) throw catError;
  if (cat) {
    assert(cat.active === true, 'CAT is no longer active — this seed must not have touched it');
    assertCount('CAT nodes still intact',
      await countRows('question_types', { exam_id: cat.id }), 75);
  }

  const total = EXAMS.reduce((n, e) => n + e.expect.nodesTotal, 0);
  const sections = EXAMS.reduce((n, e) => n + e.expect.sections, 0);
  console.log(
    `\nseeded: ${total} question types across ${sections} sections, `
    + `2 exams (GMAT, MAT), both INACTIVE.\n`
    + `No set archetypes and no passage domains for either exam — see the header.\n`
    + `Flip exams.active when the GMAT score-display question is settled.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
