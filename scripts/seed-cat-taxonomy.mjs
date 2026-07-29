/**
 * seed-cat-taxonomy.mjs
 *
 * Seeds the CAT exam config, sections, and the full question-type / set-archetype /
 * passage-domain tree.
 *
 * Run with the SERVICE ROLE key — these are shared reference tables with no write policy.
 *
 *   node scripts/seed-cat-taxonomy.mjs
 *
 * REQUIRES migrations 0001–0005. The passage-domain nodes below carry
 * kind = 'passage_domain', which 0005 adds to the check constraint on
 * question_types.kind; running this against a 0001–0004 database fails on the
 * first VARC.PASSAGE row.
 *
 * Idempotent: upserts on (exam_id, code).
 *
 * ASSERTS ITS OWN RESULT. The expected shape is declared in EXPECT below and
 * verified against the live database after seeding, not merely printed. A
 * partial seed exits non-zero. Silently losing an archetype would not break
 * anything visibly — it would just quietly remove a row from the playbook
 * forever, which is worse than a crash.
 *
 * NOTE ON WEIGHTAGES: the `weight_note` strings below are directional figures derived
 * from coaching-site analyses of CAT 2023-2025 papers, not official data. The IIMs
 * publish no syllabus and no topic distribution. Anywhere these surface in the UI they
 * must be labelled as approximate. See CLAUDE.md, "Content-generation discipline".
 */

import { createClient } from '@supabase/supabase-js';

// Fail with a readable message rather than supabase-js's "supabaseUrl is
// required" stack trace, which does not say WHICH variable is missing or where
// it is meant to come from. Checked before createClient so nothing else runs.
const MISSING = [
  ['SUPABASE_URL', 'Project Settings → API → Project URL (same value as NEXT_PUBLIC_SUPABASE_URL)'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API → service_role key (the secret one, NOT anon)'],
].filter(([name]) => !process.env[name]?.trim());

if (MISSING.length) {
  console.error('\n  SEED FAILED: missing environment variables in .env.local\n');
  for (const [name, where] of MISSING) console.error(`    ${name}\n      ${where}\n`);
  console.error('  Copy .env.local.example to .env.local and fill in the Supabase block.');
  console.error('  Note: .env.local.example is committed to git — real keys belong only in');
  console.error('  .env.local, which is gitignored.\n');
  process.exit(1);
}

// SUPABASE_URL must be the bare origin. supabase-js appends '/rest/v1/<table>'
// itself, so a URL that already carries a path produces a doubled path and
// PostgREST rejects every request with PGRST125 "Invalid path specified in
// request URL" — an error that says nothing about the actual cause. The Data API
// settings page shows both a Project URL and a RESTful endpoint, and the second
// one is easy to copy by mistake.
{
  const raw = process.env.SUPABASE_URL.trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`\n  SEED FAILED: SUPABASE_URL is not a valid URL: ${raw}\n`);
    process.exit(1);
  }
  const origin = `${parsed.protocol}//${parsed.hostname}`;
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    console.error('\n  SEED FAILED: SUPABASE_URL must be the bare origin, with no path.\n');
    console.error(`    got:      ${raw}`);
    console.error(`    expected: ${origin}\n`);
    console.error('  supabase-js adds /rest/v1 itself. Use the Project URL from');
    console.error('  Settings → Data API, not the RESTful endpoint below it.\n');
    process.exit(1);
  }
}

// The service-role / secret key bypasses RLS entirely. That is the point — the
// shared reference tables have no write policy, so a publishable key cannot seed
// them — and it is also why this script runs locally only and never from the app.
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── Exam ────────────────────────────────────────────────────────────────────

const EXAM = { code: 'CAT', name: 'Common Admission Test', adaptive: false, active: true };

const CONFIG = {
  effective_year: 2026,
  total_questions: 68,
  total_time_min: 120,
  mark_correct: 3.0,
  mark_wrong_mcq: -1.0,
  mark_wrong_numeric: 0.0,      // no negative marking on TITA
  section_order_fixed: true,    // VARC → DILR → QA, no switching
  review_edit_limit: null,
  unattempted_penalty: null,
  notes: 'CAT 2026 conducted by IIM Indore, 29 Nov 2026, three slots. Pattern assumed '
       + 'unchanged from 2024/2025 (68Q/204 marks). No pattern change announced in the '
       + '25 Jul 2026 notification. Verify against the information bulletin before the season.',
};

const SECTIONS = [
  { code: 'VARC', name: 'Verbal Ability & Reading Comprehension', ordinal: 1, time_limit_min: 40, question_count: 24 },
  { code: 'DILR', name: 'Data Interpretation & Logical Reasoning', ordinal: 2, time_limit_min: 40, question_count: 22 },
  { code: 'QA',   name: 'Quantitative Ability',                   ordinal: 3, time_limit_min: 40, question_count: 22 },
];

// ─── Taxonomy ────────────────────────────────────────────────────────────────
// Tree shape: { code, name, kind?, description?, children?: [...] }
// kind defaults to 'question_type'. DILR set shapes are 'set_archetype'.

const TAXONOMY = {
  VARC: [
    {
      code: 'VARC.RC', name: 'Reading Comprehension',
      description: '~16 of 24 questions. Log the passage domain AND the question type — '
                 + 'weakness is usually in one or the other, rarely both.',
      children: [
        { code: 'VARC.RC.MAIN',    name: 'Main idea / central theme' },
        { code: 'VARC.RC.INFER',   name: 'Inference', description: 'What follows but is not stated.' },
        { code: 'VARC.RC.FACT',    name: 'Direct / fact-based' },
        { code: 'VARC.RC.TONE',    name: "Author's tone or attitude" },
        { code: 'VARC.RC.VOCAB',   name: 'Vocabulary in context' },
        { code: 'VARC.RC.STRENGTH',name: 'Strengthen / weaken' },
        { code: 'VARC.RC.PURPOSE', name: 'Purpose / structure of passage' },
      ],
    },
    {
      // kind = 'passage_domain' on the leaves (see migration 0005): these are
      // tagged on question_attempts.passage_domain_id, NOT on question_type_id.
      // Without the distinct kind they would show up in the RC question-type
      // picker, which would be wrong. The grouping node itself stays a
      // question_type, exactly as DILR.ARCH does for the set archetypes.
      code: 'VARC.PASSAGE', name: 'Passage domain (tag alongside RC questions)',
      description: 'Domain is often the real variable — many aspirants are fine on '
                 + 'business passages and collapse on abstract philosophy.',
      children: [
        { code: 'VARC.PASSAGE.ECON',  name: 'Economics / business',   kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.SCI',   name: 'Science / technology',   kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.PHIL',  name: 'Philosophy / abstract',  kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.SOC',   name: 'Sociology / politics',   kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.HIST',  name: 'History / culture',      kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.ARTS',  name: 'Literature / arts',      kind: 'passage_domain' },
        { code: 'VARC.PASSAGE.PSYCH', name: 'Psychology',             kind: 'passage_domain' },
      ],
    },
    {
      code: 'VARC.VA', name: 'Verbal Ability',
      description: '~8 questions, predominantly TITA — so no negative marking. '
                 + 'Never leave these blank.',
      children: [
        { code: 'VARC.VA.JUMBLE',  name: 'Para jumbles' },
        { code: 'VARC.VA.SUMMARY', name: 'Para summary' },
        { code: 'VARC.VA.ODD',     name: 'Odd sentence out' },
        { code: 'VARC.VA.INSERT',  name: 'Sentence insertion / para completion' },
      ],
    },
  ],

  // DILR carries both set archetypes (the selection engine) and question-level types.
  DILR: [
    {
      code: 'DILR.ARCH', name: 'Set archetypes',
      description: 'Tag every set on the paper — including the ones you never touched. '
                 + 'Skipped sets are what make skip-regret computable.',
      children: [
        { code: 'DILR.ARCH.ARRANGE',   name: 'Arrangements', kind: 'set_archetype',
          description: 'Linear, circular (with direction), matrix/grid, multi-tier. Appears every year.' },
        { code: 'DILR.ARCH.GAMES',     name: 'Games & tournaments', kind: 'set_archetype',
          description: 'Knockout and round-robin, points tables, goal difference, conditional progression. High frequency 2022-2025.' },
        { code: 'DILR.ARCH.BINARY',    name: 'Binary logic / truth-tellers & liars', kind: 'set_archetype' },
        { code: 'DILR.ARCH.VENN',      name: 'Venn diagrams', kind: 'set_archetype',
          description: '2-set and 3-set routinely; 4-set appeared in 2022, 2023 and 2024.' },
        { code: 'DILR.ARCH.SCHEDULE',  name: 'Scheduling / timetabling', kind: 'set_archetype',
          description: 'Increasingly common post-2020.' },
        { code: 'DILR.ARCH.TEAM',      name: 'Team formation / selection', kind: 'set_archetype' },
        { code: 'DILR.ARCH.CASELET',   name: 'Quant-heavy DI caselet', kind: 'set_archetype',
          description: 'Tables with missing values, multi-dimensional caselets. Calculation-intensive.' },
        { code: 'DILR.ARCH.CHART',     name: 'Chart interpretation (bar / line / pie)', kind: 'set_archetype' },
        { code: 'DILR.ARCH.SCATTER',   name: 'Scatter plot / correlation', kind: 'set_archetype',
          description: 'Prominent in CAT 2024. Visual-inference heavy, low calculation.' },
        { code: 'DILR.ARCH.NETWORK',   name: 'Routes & networks', kind: 'set_archetype' },
        { code: 'DILR.ARCH.HYBRID',    name: 'Grid / quant-logic hybrid', kind: 'set_archetype',
          description: 'Growing 2023-2024. Logic scaffold with arithmetic inside.' },
        { code: 'DILR.ARCH.DS',        name: 'Data sufficiency', kind: 'set_archetype' },
      ],
    },
    {
      code: 'DILR.SKILL', name: 'Underlying skill (tag the question, not the set)',
      children: [
        { code: 'DILR.SKILL.DEDUCE',  name: 'Constraint deduction' },
        { code: 'DILR.SKILL.CALC',    name: 'Calculation / approximation' },
        { code: 'DILR.SKILL.READ',    name: 'Data extraction from the exhibit' },
        { code: 'DILR.SKILL.COUNT',   name: 'Counting / enumeration' },
      ],
    },
  ],

  QA: [
    {
      code: 'QA.ARITH', name: 'Arithmetic',
      description: 'The dominant block — roughly 40% of QA in recent papers. '
                 + 'Highest return on revision time.',
      children: [
        { code: 'QA.ARITH.PCT',    name: 'Percentages' },
        { code: 'QA.ARITH.PLD',    name: 'Profit, loss & discount' },
        { code: 'QA.ARITH.RATIO',  name: 'Ratio & proportion' },
        { code: 'QA.ARITH.AVG',    name: 'Averages' },
        { code: 'QA.ARITH.MIX',    name: 'Mixtures & alligations' },
        { code: 'QA.ARITH.TSD',    name: 'Time, speed & distance' },
        { code: 'QA.ARITH.WORK',   name: 'Time & work' },
        { code: 'QA.ARITH.SICI',   name: 'Simple & compound interest' },
      ],
    },
    {
      code: 'QA.ALG', name: 'Algebra',
      description: 'Roughly 27% of QA. Arithmetic + Algebra together are ~60-70% of the section.',
      children: [
        { code: 'QA.ALG.LINEAR',   name: 'Linear equations' },
        { code: 'QA.ALG.QUAD',     name: 'Quadratic equations' },
        { code: 'QA.ALG.INEQ',     name: 'Inequalities & modulus' },
        { code: 'QA.ALG.FUNC',     name: 'Functions' },
        { code: 'QA.ALG.LOG',      name: 'Logarithms' },
        { code: 'QA.ALG.PROG',     name: 'Progressions (AP / GP / HP)' },
        { code: 'QA.ALG.POLY',     name: 'Polynomials' },
        { code: 'QA.ALG.MAXMIN',   name: 'Maxima & minima' },
        { code: 'QA.ALG.IDENT',    name: 'Algebraic identities' },
      ],
    },
    {
      code: 'QA.GEOM', name: 'Geometry & mensuration',
      description: 'Roughly 14% of QA.',
      children: [
        { code: 'QA.GEOM.TRI',     name: 'Triangles' },
        { code: 'QA.GEOM.CIRCLE',  name: 'Circles' },
        { code: 'QA.GEOM.POLY',    name: 'Polygons & quadrilaterals' },
        { code: 'QA.GEOM.COORD',   name: 'Coordinate geometry' },
        { code: 'QA.GEOM.MENS',    name: 'Mensuration (solids)' },
        { code: 'QA.GEOM.TRIG',    name: 'Trigonometry', description: 'Occasional.' },
      ],
    },
    {
      code: 'QA.NUM', name: 'Number systems',
      description: 'Roughly 9% of QA.',
      children: [
        { code: 'QA.NUM.FACT',   name: 'Factors & multiples' },
        { code: 'QA.NUM.REM',    name: 'Remainders' },
        { code: 'QA.NUM.DIV',    name: 'Divisibility' },
        { code: 'QA.NUM.BASE',   name: 'Base systems' },
      ],
    },
    {
      code: 'QA.MODERN', name: 'Modern maths',
      description: 'Roughly 9% of QA.',
      children: [
        { code: 'QA.MODERN.PNC',   name: 'Permutations & combinations' },
        { code: 'QA.MODERN.PROB',  name: 'Probability' },
        { code: 'QA.MODERN.SET',   name: 'Set theory & Venn' },
        { code: 'QA.MODERN.BINOM', name: 'Binomial theorem' },
      ],
    },
  ],
};

// ─── Expected shape ──────────────────────────────────────────────────────────
// Hand-counted from the TAXONOMY literal above, then verified against the live
// database after seeding. If you add or remove a node, update these numbers in
// the same edit — a mismatch is meant to stop the script, not be worked around.
//
// Do NOT raise `set_archetype` past 12 without reading the archetype-granularity
// rule in CLAUDE.md first. A student sees ~5 DILR sets per mock, so a 12-mock
// season is ~60 sets; spread across 12 archetypes that averages exactly the
// 5-set evidence threshold. Splitting an archetype pushes most of them
// permanently below threshold and the playbook renders as locked cards forever.

const EXPECT = {
  sections: 3,
  nodesBySection: { VARC: 21, DILR: 18, QA: 36 },
  nodesTotal: 75,
  byKind: {
    question_type:  56,   // 14 VARC + 6 DILR + 36 QA
    set_archetype:  12,   // the DILR selection engine
    passage_domain:  7,   // VARC RC passage subjects (migration 0005)
  },
};

function fail(message) {
  console.error(`\n  SEED FAILED: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertCount(label, actual, expected) {
  assert(actual === expected, `${label}: expected ${expected}, found ${actual}`);
  console.log(`  ok  ${label}: ${actual}`);
}

// Walk the literal and flatten it, so the checks below read the same tree the
// seeder writes rather than a second hand-maintained list.
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

// Runs BEFORE touching the database. Catches a duplicated code, which upsert
// would otherwise resolve silently by overwriting the first row — losing a node
// with no error anywhere.
function verifyLiteral() {
  console.log('checking the taxonomy literal...');

  const all = Object.entries(TAXONOMY)
    .flatMap(([sectionCode, roots]) => flatten(roots, sectionCode));

  const seen = new Map();
  for (const node of all) {
    if (seen.has(node.code)) {
      fail(`duplicate code '${node.code}' — upsert would silently overwrite the first one`);
    }
    seen.set(node.code, node);
  }

  assertCount('literal nodes', all.length, EXPECT.nodesTotal);

  for (const [sectionCode, expected] of Object.entries(EXPECT.nodesBySection)) {
    assertCount(
      `literal ${sectionCode} nodes`,
      all.filter(n => n.sectionCode === sectionCode).length,
      expected,
    );
  }

  for (const [kind, expected] of Object.entries(EXPECT.byKind)) {
    assertCount(`literal kind=${kind}`, all.filter(n => n.kind === kind).length, expected);
  }

  // Only leaves are selectable when logging, so a non-leaf carrying a tagging
  // kind would be a node nothing can ever reach.
  for (const node of all) {
    if (node.kind !== 'question_type' && !node.isLeaf) {
      fail(`'${node.code}' has kind='${node.kind}' but is a grouping node — nothing could select it`);
    }
  }

  // Cross-check the section question counts against the exam config, so a typo
  // in either one is caught here rather than showing up as a wrong denominator
  // in accuracy figures months later.
  const declared = SECTIONS.reduce((sum, s) => sum + s.question_count, 0);
  assertCount('section question_count sum vs exam_config.total_questions',
    declared, CONFIG.total_questions);

  console.log('literal ok\n');
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function upsertExam() {
  const { data, error } = await db.from('exams')
    .upsert(EXAM, { onConflict: 'code' }).select().single();
  if (error) throw error;
  return data;
}

async function upsertConfig(examId) {
  const { error } = await db.from('exam_configs')
    .upsert({ ...CONFIG, exam_id: examId }, { onConflict: 'exam_id,effective_year' });
  if (error) throw error;
}

async function upsertSections(examId) {
  const rows = SECTIONS.map(s => ({ ...s, exam_id: examId }));
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
// The point of re-reading rather than trusting the write loop: a partial failure,
// a stale row from an earlier taxonomy revision, or an upsert that silently
// merged two nodes all look fine from the writer's side and wrong from here.

async function countRows(table, filters) {
  let query = db.from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function verifyDatabase(examId, sectionIds) {
  console.log('\nverifying against the database...');

  assertCount('db sections', await countRows('sections', { exam_id: examId }), EXPECT.sections);

  assertCount('db nodes total',
    await countRows('question_types', { exam_id: examId }), EXPECT.nodesTotal);

  for (const [sectionCode, expected] of Object.entries(EXPECT.nodesBySection)) {
    assertCount(`db ${sectionCode} nodes`,
      await countRows('question_types', { exam_id: examId, section_id: sectionIds[sectionCode] }),
      expected);
  }

  for (const [kind, expected] of Object.entries(EXPECT.byKind)) {
    assertCount(`db kind=${kind}`,
      await countRows('question_types', { exam_id: examId, kind }), expected);
  }

  // Every node must be reachable: exactly one root per top-level group, and no
  // orphan whose parent failed to upsert. Roots are the nodes with no parent.
  const { data: roots, error } = await db.from('question_types')
    .select('code').eq('exam_id', examId).is('parent_id', null);
  if (error) throw error;

  const expectedRoots = Object.values(TAXONOMY).reduce((n, r) => n + r.length, 0);
  assertCount('db root nodes', roots.length, expectedRoots);

  console.log('database ok');
}

async function main() {
  verifyLiteral();

  const exam = await upsertExam();
  console.log(`exam: ${exam.code}`);

  await upsertConfig(exam.id);
  console.log(`config: ${CONFIG.effective_year}`);

  const sectionIds = await upsertSections(exam.id);
  console.log(`sections: ${Object.keys(sectionIds).join(', ')}`);

  assert(
    Object.keys(TAXONOMY).every(code => sectionIds[code]),
    `TAXONOMY references a section that was not seeded: `
    + `${Object.keys(TAXONOMY).filter(c => !sectionIds[c]).join(', ')}`,
  );

  for (const [sectionCode, roots] of Object.entries(TAXONOMY)) {
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

  await verifyDatabase(exam.id, sectionIds);

  console.log(
    `\nseeded: ${EXPECT.nodesTotal} nodes `
    + `(${EXPECT.byKind.question_type} question types, `
    + `${EXPECT.byKind.set_archetype} set archetypes, `
    + `${EXPECT.byKind.passage_domain} passage domains) `
    + `across ${EXPECT.sections} sections.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
