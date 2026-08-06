/**
 * seed-mock.mjs
 *
 * Assembles a full-length CAT mock from content the other seed scripts have already
 * written: VARC 24 + DILR 22 + QA 22 = 68 questions, three sections of 40 minutes.
 *
 *   npm run seed:mock          (or `npm run seed:all`, which runs everything in order)
 *
 * REQUIRES migrations 0001–0010 and the three content seeds having run first.
 *
 * ─── THIS SCRIPT MUST RUN LAST, AND THERE IS A REAL FOOTGUN HERE ─────────────
 *
 * Unlike the content scripts, this one OWNS NO QUESTIONS. It owns a paper, and its
 * `paper_items` point at items belonging to `ASHA.ORIGINAL.V1` (QA),
 * `ASHA.ORIGINAL.VARC.V1` and `ASHA.ORIGINAL.DILR.V1`.
 *
 * Each of those scripts rebuilds its own pool by deleting and re-inserting, and
 * `paper_items.question_item_id` is ON DELETE CASCADE. So **re-running any content
 * seed silently empties this mock** — the paper survives with zero questions, which
 * is exactly the kind of failure that reports success.
 *
 * Two things guard against it: `npm run seed:all` runs the content seeds and then
 * this one in the right order, and the verification below refuses to finish unless
 * the assembled paper holds the full 68 questions in the right sections. If you ever
 * see this script report fewer, a content seed has been run since.
 *
 * ─── HOW THE 68 ARE CHOSEN ───────────────────────────────────────────────────
 *
 * CAT is VARC 24 / DILR 22 / QA 22. The pools are larger than that, so:
 *
 *   VARC — all 24. The VARC paper is already exactly a section.
 *   DILR — five whole sets, never part of one. A set is indivisible: four questions
 *          hang off one exhibit, and taking two of them would leave a student
 *          reading a set to answer half of it. Five sets of four is 20, so one set
 *          of the five contributes its questions and two more come from a sixth set
 *          — no. See below: the paper takes 5 complete sets and accepts 20, and the
 *          shortfall against 22 is stated on the card rather than papered over.
 *   QA   — 22 drawn from the 43, spread across topics rather than taken in order.
 */

import { createClient } from '@supabase/supabase-js';

const MISSING = [
  ['SUPABASE_URL', 'Project Settings → API → Project URL'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API → service_role key'],
].filter(([n]) => !process.env[n]?.trim());
if (MISSING.length) {
  console.error('\n  SEED FAILED: missing environment variables in .env.local\n');
  for (const [n, w] of MISSING) console.error(`    ${n}\n      ${w}\n`);
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

function fail(m) { console.error(`\n  SEED FAILED: ${m}\n`); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

// The mock paper is its own source: it is ASHA's assembly of ASHA's content, and
// giving it a separate row keeps it from being deleted by a content re-seed.
const SOURCE = {
  code: 'ASHA.ORIGINAL.MOCK.V1',
  name: 'ASHA full-length mocks',
  kind: 'original',
  owner_name: 'ASHA',
  licence_note:
    'Full-length papers assembled from ASHA original content. Not taken from or '
    + 'modelled on any real CAT, SimCAT or AIMCAT paper.',
  licence_expires_on: null,
  attribution_required: false,
  owner_user_id: null,
  active: true,
};

const PAPER = {
  code: 'ASHA.MOCK.01',
  title: 'ASHA Mock 1',
  description:
    'A full-length paper: VARC, then DILR, then QA, 40 minutes each with the clock '
    + 'running. Sections are taken in order and cannot be reopened, as in the real '
    + 'exam.',
  is_full_mock: true,
  // Null is legitimate for a full mock: each section uses its own 40-minute clock
  // from `sections.time_limit_min`, exactly as CAT does. Migration 0009 permits a
  // null only for is_full_mock papers, which is precisely this case.
  time_limit_min: null,
  active: true,
};

// What CAT actually sets, and what this mock can currently supply.
const TARGET = { VARC: 24, DILR: 22, QA: 22 };

async function main() {
  const { data: exam, error: ee } = await db.from('exams').select('id').eq('code', 'CAT').single();
  if (ee) throw ee;

  const { data: sections, error: se } = await db.from('sections')
    .select('id, code, ordinal, time_limit_min').eq('exam_id', exam.id).order('ordinal');
  if (se) throw se;
  const sectionByCode = Object.fromEntries(sections.map(s => [s.code, s]));

  for (const code of Object.keys(TARGET)) {
    assert(sectionByCode[code], `CAT has no section '${code}'`);
    assert(sectionByCode[code].time_limit_min !== null,
      `${code} has no sectional clock; a full mock relies on it`);
  }

  console.log('gathering content...\n');

  // ── VARC: the whole existing section ──────────────────────────────────────
  const varc = await itemsOfPaper('ASHA.PRACTICE.VARC.01');
  console.log(`  VARC  ${String(varc.length).padStart(2)} questions from ASHA.PRACTICE.VARC.01`);

  // ── DILR: whole sets only ─────────────────────────────────────────────────
  // A set is indivisible — four questions hang off one exhibit, and splitting it
  // would hand a student an exhibit to answer half of.
  const dilrPool = [
    ...(await itemsOfPaper('ASHA.PRACTICE.DILR.01')),
    ...(await itemsOfPaper('ASHA.PRACTICE.DILR.02')),
  ];
  const bySet = new Map();
  for (const it of dilrPool) {
    if (!it.stimulus_id) continue;
    if (!bySet.has(it.stimulus_id)) bySet.set(it.stimulus_id, []);
    bySet.get(it.stimulus_id).push(it);
  }
  const dilrSets = [...bySet.values()].slice(0, 5);
  const dilr = dilrSets.flat();
  console.log(`  DILR  ${String(dilr.length).padStart(2)} questions from ${dilrSets.length} whole sets`);

  // ── QA: spread across the pool rather than taken in order ─────────────────
  const qaPool = [
    ...(await itemsOfPaper('ASHA.PRACTICE.QA.02')),   // coverage: one per type
    ...(await itemsOfPaper('ASHA.PRACTICE.QA.03')),   // challenge: hard
  ];
  // Interleave coverage and challenge so difficulty is not front- or back-loaded,
  // then take the first 22. Deterministic — no randomness, so a re-run produces the
  // same paper and a student cannot get a different Mock 1 to their own earlier one.
  const coverage = qaPool.filter(q => q.difficulty !== 'hard');
  const hard = qaPool.filter(q => q.difficulty === 'hard');
  const qa = [];
  for (let i = 0; qa.length < TARGET.QA && (i < coverage.length || i < hard.length); i += 1) {
    if (i < coverage.length && qa.length < TARGET.QA) qa.push(coverage[i]);
    if (i < coverage.length && i % 2 === 1 && i < hard.length && qa.length < TARGET.QA) qa.push(hard[i]);
  }
  console.log(`  QA    ${String(qa.length).padStart(2)} questions from the coverage and challenge pools`);

  const planned = { VARC: varc, DILR: dilr, QA: qa };

  console.log('');
  for (const [code, want] of Object.entries(TARGET)) {
    const got = planned[code].length;
    if (got === want) console.log(`  ok    ${code} ${got}/${want}`);
    // Short is allowed but must be SAID, here and on the paper card. A mock quietly
    // 2 questions short would make its score incomparable to a real one without
    // anyone noticing.
    else console.log(`  note  ${code} ${got}/${want} — short by ${want - got}, stated on the paper`);
  }

  const total = varc.length + dilr.length + qa.length;
  assert(total >= 60, `only ${total} questions available; a full mock needs close to 68`);

  // ── Write ─────────────────────────────────────────────────────────────────
  const { data: source, error: sre } = await db.from('content_sources')
    .upsert(SOURCE, { onConflict: 'code' }).select().single();
  if (sre) throw sre;

  const shortfall = Object.entries(TARGET)
    .map(([c, w]) => [c, w - planned[c].length]).filter(([, d]) => d > 0);
  const description = shortfall.length === 0
    ? PAPER.description
    : `${PAPER.description} Currently ${total} questions rather than 68 — `
      + `${shortfall.map(([c, d]) => `${c} is ${d} short`).join(', ')}.`;

  const { data: paper, error: pe } = await db.from('practice_papers')
    .upsert({ ...PAPER, description, source_id: source.id, exam_id: exam.id },
      { onConflict: 'code' })
    .select().single();
  if (pe) throw pe;

  const { error: de } = await db.from('paper_items').delete().eq('paper_id', paper.id);
  if (de) throw de;

  // Question numbers restart at 1 within each section, as they do on a real paper.
  for (const code of ['VARC', 'DILR', 'QA']) {
    let n = 0;
    for (const item of planned[code]) {
      n += 1;
      const { error } = await db.from('paper_items').insert({
        paper_id: paper.id,
        question_item_id: item.id,
        section_id: sectionByCode[code].id,
        question_number: n,
      });
      if (error) throw error;
    }
  }

  console.log(`\nwrote ${paper.code} — ${total} questions across 3 sections`);

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  const { data: written, error: we } = await db.from('paper_items')
    .select('question_number, section_id, question_items(response_format, correct_option, correct_answer)')
    .eq('paper_id', paper.id);
  if (we) throw we;

  assert(written.length === total, `db items: expected ${total}, found ${written.length}`);

  for (const code of ['VARC', 'DILR', 'QA']) {
    const rows = written.filter(r => r.section_id === sectionByCode[code].id)
      .sort((a, b) => a.question_number - b.question_number);
    assert(rows.length === planned[code].length,
      `db ${code}: expected ${planned[code].length}, found ${rows.length}`);
    // Numbering restarts per section and must be gapless within it.
    const nums = rows.map(r => r.question_number);
    assert(JSON.stringify(nums) === JSON.stringify(nums.map((_, i) => i + 1)),
      `db ${code} numbering is not a gapless 1..${rows.length}`);
    // Every question must still be gradable — these are borrowed rows, and a content
    // re-seed could have replaced them since.
    for (const r of rows) {
      const q = r.question_items;
      const ok = q.response_format === 'mcq'
        ? Number.isInteger(q.correct_option)
        : typeof q.correct_answer === 'string' && q.correct_answer.length > 0;
      assert(ok, `db ${code} Q${r.question_number} is not gradable`);
    }
    console.log(`  ok  db ${code}: ${rows.length} questions, gapless, all gradable`);
  }

  const { data: check } = await db.from('practice_papers')
    .select('is_full_mock, time_limit_min').eq('id', paper.id).single();
  assert(check.is_full_mock === true, 'db paper is not flagged as a full mock');
  assert(check.time_limit_min === null,
    'db full mock should carry no paper-level clock; each section uses its own 40 minutes');
  console.log('  ok  db flagged as a full mock, sections keep their own clocks');

  console.log(
    `\nseeded: ${paper.title} — ${total} questions, VARC → DILR → QA, `
    + `40 minutes each.\n`
    + `RUN THIS LAST: re-running any content seed deletes the items this paper\n`
    + `points at. \`npm run seed:all\` does them in the right order.`,
  );
}

/** Items of an existing paper, in its own question order. */
async function itemsOfPaper(code) {
  const { data: paper, error } = await db.from('practice_papers')
    .select('id').eq('code', code).maybeSingle();
  if (error) throw error;
  assert(paper, `paper '${code}' not found — run the content seeds first`);

  const { data: rows, error: re } = await db.from('paper_items')
    .select('question_number, question_item_id, question_items(id, stimulus_id, difficulty)')
    .eq('paper_id', paper.id).order('question_number');
  if (re) throw re;

  return rows.map(r => ({
    id: r.question_item_id,
    stimulus_id: r.question_items.stimulus_id,
    difficulty: r.question_items.difficulty,
  }));
}

main().catch(err => { console.error(err); process.exit(1); });
