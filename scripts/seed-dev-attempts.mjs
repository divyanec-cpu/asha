/**
 * seed-dev-attempts.mjs
 *
 * Synthetic mock attempts for DEVELOPMENT ONLY, so the analytics in Phase 5 have
 * enough data to cross their evidence thresholds. Nothing real can be built
 * against one mock: set-selection needs 5 sets of an archetype, calibration 30
 * confidence-tagged answers, pacing 3 mocks.
 *
 *   node --env-file=.env.local scripts/seed-dev-attempts.mjs --phone 9000000001
 *   node --env-file=.env.local scripts/seed-dev-attempts.mjs --phone 9000000001 --delete
 *
 * THREE SAFEGUARDS, because fabricated data sitting in the same tables as real
 * data is a genuine hazard — it would silently corrupt a real student's
 * insights, and ASHA's entire claim is that its numbers are honest:
 *
 *   1. Every mock_sources row is titled with the SYNTH_PREFIX below, so
 *      synthetic data is obvious in the UI and greppable in the database.
 *   2. `--delete` removes exactly and only those rows. Attempt rows cascade
 *      from mock_attempts, so nothing is orphaned.
 *   3. The generator is DETERMINISTIC — a seeded PRNG, no Math.random and no
 *      new Date() — so the same command always produces the same data. That is
 *      what makes it usable as an analytics fixture: a test can assert real
 *      numbers against it.
 *
 * The synthetic student has a deliberate, internally consistent profile so the
 * analytics have something true to find:
 *   - clears Games & Tournaments reliably, has never cleared a scatter plot
 *   - fast and accurate on Arithmetic; slow and wrong on Time & Work
 *   - most QA errors are misreads, not concept gaps
 *   - well calibrated when certain, badly calibrated when guessing
 *   - collapses in the third quarter of QA
 * Phase 5's job is to rediscover exactly that from the rows alone.
 */

import { createClient } from '@supabase/supabase-js';

const SYNTH_PREFIX = '[SYNTH]';

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DELETE_MODE = args.includes('--delete');
const phoneArg = args[args.indexOf('--phone') + 1];
const PHONE = args.includes('--phone') && phoneArg && /^\d{10}$/.test(phoneArg) ? phoneArg : null;

if (!PHONE) {
  console.error('\n  Usage: node --env-file=.env.local scripts/seed-dev-attempts.mjs --phone 9876543210 [--delete]\n');
  process.exit(1);
}

for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]?.trim()) {
    console.error(`\n  Missing ${name} in .env.local\n`);
    process.exit(1);
  }
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Deterministic PRNG ──────────────────────────────────────────────────────
// mulberry32. Seeded so every run is identical — see safeguard 3 above.

function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True with probability p. */
const chance = (rng, p) => rng() < p;
/** Random element. */
const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ─── The synthetic student's profile ─────────────────────────────────────────

/** DILR archetypes: how often this student clears each, and how long it takes. */
const ARCHETYPE_PROFILE = [
  { code: 'DILR.ARCH.GAMES',   clearRate: 0.80, sec: 540, weight: 3 },
  { code: 'DILR.ARCH.ARRANGE', clearRate: 0.65, sec: 700, weight: 3 },
  { code: 'DILR.ARCH.CASELET', clearRate: 0.43, sec: 800, weight: 2 },
  { code: 'DILR.ARCH.VENN',    clearRate: 0.40, sec: 605, weight: 2 },
  { code: 'DILR.ARCH.SCATTER', clearRate: 0.00, sec: 470, weight: 2 },
  { code: 'DILR.ARCH.HYBRID',  clearRate: 0.35, sec: 720, weight: 1 },
];

/** QA types: accuracy and typical time. Deliberately spread across the
 *  accuracy-vs-time quadrant so Phase 5's quadrant analytic has all four
 *  corners populated. */
const QA_PROFILE = [
  { code: 'QA.ARITH.AVG',    acc: 0.88, sec: 90,  n: 3 },
  { code: 'QA.ARITH.RATIO',  acc: 0.85, sec: 90,  n: 3 },
  { code: 'QA.ARITH.PCT',    acc: 0.82, sec: 90,  n: 3 },
  { code: 'QA.ALG.LINEAR',   acc: 0.78, sec: 90,  n: 2 },
  { code: 'QA.ALG.LOG',      acc: 0.70, sec: 180, n: 2 },
  { code: 'QA.GEOM.MENS',    acc: 0.55, sec: 180, n: 2 },
  { code: 'QA.NUM.REM',      acc: 0.45, sec: 30,  n: 2 },
  { code: 'QA.MODERN.PNC',   acc: 0.35, sec: 300, n: 2 },
  { code: 'QA.ARITH.WORK',   acc: 0.36, sec: 300, n: 3 },  // the time trap
];

/** VARC types, plus the passage-domain effect: this student is fine on business
 *  and science, and collapses on abstract philosophy. */
const VARC_PROFILE = [
  { code: 'VARC.RC.MAIN',   acc: 0.80, sec: 90,  n: 3, passage: true },
  { code: 'VARC.RC.INFER',  acc: 0.62, sec: 180, n: 4, passage: true },
  { code: 'VARC.RC.FACT',   acc: 0.85, sec: 90,  n: 3, passage: true },
  { code: 'VARC.RC.TONE',   acc: 0.58, sec: 180, n: 2, passage: true },
  { code: 'VARC.RC.VOCAB',  acc: 0.75, sec: 30,  n: 2, passage: true },
  { code: 'VARC.VA.JUMBLE', acc: 0.55, sec: 90,  n: 4, tita: true },
  { code: 'VARC.VA.SUMMARY',acc: 0.60, sec: 90,  n: 3, tita: true },
  { code: 'VARC.VA.ODD',    acc: 0.50, sec: 90,  n: 3, tita: true },
];

const PASSAGE_EFFECT = [
  { code: 'VARC.PASSAGE.ECON',  delta:  0.10 },
  { code: 'VARC.PASSAGE.SCI',   delta:  0.05 },
  { code: 'VARC.PASSAGE.PHIL',  delta: -0.28 },   // the real weakness
  { code: 'VARC.PASSAGE.SOC',   delta:  0.00 },
  { code: 'VARC.PASSAGE.HIST',  delta: -0.05 },
];

/** Error causes, weighted. Misreads dominate — the finding the design's home
 *  screen reports as "nine of your fourteen QA errors were misreads". */
const CAUSES = ['misread', 'misread', 'misread', 'conceptual', 'conceptual', 'silly', 'time'];

/** Eight mocks, roughly weekly, improving with real noise — mock 2 is worse
 *  than mock 1, so a naive trendline would be wrong and the band is honest. */
const MOCKS = [
  { title: 'SimCAT 01', provider: 'SimCAT', date: '2026-06-07', varc: 28, dilr: 18, qa: 38 },
  { title: 'AIMCAT 01', provider: 'AIMCAT', date: '2026-06-14', varc: 26, dilr: 21, qa: 32 },
  { title: 'SimCAT 02', provider: 'SimCAT', date: '2026-06-21', varc: 32, dilr: 20, qa: 44 },
  { title: 'iCAT 01',   provider: 'iCAT',   date: '2026-06-28', varc: 31, dilr: 24, qa: 41 },
  { title: 'AIMCAT 02', provider: 'AIMCAT', date: '2026-07-05', varc: 35, dilr: 22, qa: 39 },
  { title: 'SimCAT 03', provider: 'SimCAT', date: '2026-07-12', varc: 34, dilr: 25, qa: 47 },
  { title: 'AIMCAT 03', provider: 'AIMCAT', date: '2026-07-19', varc: 38, dilr: 23, qa: 46 },
  { title: 'SimCAT 04', provider: 'SimCAT', date: '2026-07-26', varc: 39, dilr: 27, qa: 49 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveUserId() {
  const { data, error } = await db.rpc('get_user_id_by_phone', { p_phone: `+91${PHONE}` });
  if (error) throw error;
  if (!data) {
    console.error(`\n  No account for +91${PHONE}. Sign in once through the app first.\n`);
    process.exit(1);
  }
  return data;
}

async function loadTaxonomy(examId) {
  const { data, error } = await db
    .from('question_types')
    .select('id, code, kind')
    .eq('exam_id', examId);
  if (error) throw error;
  return new Map(data.map((r) => [r.code, r.id]));
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteSynthetic(userId) {
  const { data: sources, error } = await db
    .from('mock_sources')
    .select('id, title')
    .eq('user_id', userId)
    .like('title', `${SYNTH_PREFIX}%`);
  if (error) throw error;

  if (!sources.length) {
    console.log('nothing synthetic to delete');
    return;
  }

  const ids = sources.map((s) => s.id);
  // Delete attempts first: source_id is ON DELETE SET NULL, so removing sources
  // alone would leave the attempts behind with no way to identify them.
  const { error: attemptError, count } = await db
    .from('mock_attempts')
    .delete({ count: 'exact' })
    .in('source_id', ids);
  if (attemptError) throw attemptError;

  const { error: sourceError } = await db.from('mock_sources').delete().in('id', ids);
  if (sourceError) throw sourceError;

  console.log(`deleted ${count} synthetic attempt(s) and ${ids.length} source(s)`);
  console.log('(section, set and question rows cascaded from mock_attempts)');
}

// ─── Generate ────────────────────────────────────────────────────────────────

function buildQuestions(rng, profile, sectionQNumber, tax, isVarc) {
  const rows = [];
  let n = sectionQNumber;

  for (const type of profile) {
    for (let i = 0; i < type.n; i++) {
      const passage = isVarc && type.passage ? pickOne(rng, PASSAGE_EFFECT) : null;
      const acc = Math.max(0.05, Math.min(0.97, type.acc + (passage?.delta ?? 0)));

      // Skip roughly one in twelve, more often on the slow types.
      const skipped = chance(rng, type.sec >= 300 ? 0.18 : 0.06);
      const correct = skipped ? null : chance(rng, acc);

      // Confidence is generated FROM correctness, so the calibration analytic
      // has a real relationship to recover rather than noise. The split below
      // yields roughly: certain → 92% right, unsure → 54%, guessing → 24%
      // (measured on the seeded output). Well calibrated when sure, near
      // worthless when guessing — which is the point of the fixture.
      //
      // Skipped questions carry no confidence: you cannot rate certainty on an
      // answer you never gave.
      let confidence = null;
      if (!skipped) {
        const r = rng();
        if (correct) confidence = r < 0.62 ? 3 : r < 0.9 ? 2 : 1;
        else confidence = r < 0.12 ? 3 : r < 0.55 ? 2 : 1;
      }

      const tita = Boolean(type.tita);
      rows.push({
        question_type_id: tax.get(type.code) ?? null,
        passage_domain_id: passage ? (tax.get(passage.code) ?? null) : null,
        question_number: n,
        response_format: tita ? 'tita' : 'mcq',
        order_index: n,
        time_spent_sec: type.sec,
        status: skipped ? 'skipped' : 'attempted',
        is_correct: correct,
        confidence,
        error_cause: correct === false ? pickOne(rng, CAUSES) : skipped ? 'time' : 'none',
        marks_earned: skipped ? 0 : correct ? 3 : tita ? 0 : -1,
      });
      n++;
    }
  }
  return rows;
}

function buildSets(rng, tax, mockIndex) {
  // Five sets per paper, drawn by weight but always including scatter plot every
  // other mock so it reaches its 5-set threshold with a 0% clear rate.
  const pool = ARCHETYPE_PROFILE.flatMap((a) => Array(a.weight).fill(a));
  const chosen = [];
  const seen = new Set();
  if (mockIndex % 2 === 0) {
    const scatter = ARCHETYPE_PROFILE.find((a) => a.code === 'DILR.ARCH.SCATTER');
    chosen.push(scatter);
    seen.add(scatter.code);
  }
  while (chosen.length < 5) {
    const a = pickOne(rng, pool);
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    chosen.push(a);
  }

  const sizes = [4, 4, 5, 4, 5];
  let order = 0;
  return chosen.map((a, i) => {
    const numQuestions = sizes[i];
    // Attempts three of five; scatter plot gets opened when it appears, because
    // that is precisely the mistake being modelled.
    const opens = i < 3 || a.code === 'DILR.ARCH.SCATTER';
    if (!opens) {
      const wouldHaveCleared = chance(rng, 0.22);
      return {
        archetype_id: tax.get(a.code) ?? null,
        label: `Set ${i + 1}`,
        num_questions: numQuestions,
        num_attempted: null,
        num_correct: null,
        chosen: false,
        selection_order: null,
        time_spent_sec: chance(rng, 0.5) ? 60 : 0,
        marks_earned: 0,
        solvable_verdict: wouldHaveCleared ? 'skipped_would_have_cleared' : 'skipped_correctly',
      };
    }

    order += 1;
    const cleared = chance(rng, a.clearRate);
    const abandoned = !cleared && chance(rng, 0.3);
    const attempted = cleared ? numQuestions : abandoned ? 0 : Math.max(1, Math.round(numQuestions * 0.5));
    const correct = cleared ? numQuestions : abandoned ? 0 : chance(rng, 0.35) ? 1 : 0;
    return {
      archetype_id: tax.get(a.code) ?? null,
      label: `Set ${i + 1}`,
      num_questions: numQuestions,
      num_attempted: attempted,
      num_correct: correct,
      chosen: true,
      selection_order: order,
      time_spent_sec: abandoned ? Math.round(a.sec * 0.55) : a.sec,
      marks_earned: correct * 3 + (attempted - correct) * -1,
      solvable_verdict: cleared ? 'cleared' : abandoned ? 'abandoned_midway' : 'attempted_failed',
    };
  });
}

async function seed(userId) {
  const { data: exam, error: examError } = await db
    .from('exams')
    .select('id')
    .eq('code', 'CAT')
    .single();
  if (examError) throw examError;

  const { data: config } = await db
    .from('exam_configs')
    .select('id')
    .eq('exam_id', exam.id)
    .order('effective_year', { ascending: false })
    .limit(1)
    .single();

  const { data: sections } = await db
    .from('sections')
    .select('id, code, question_count')
    .eq('exam_id', exam.id)
    .order('ordinal');

  const tax = await loadTaxonomy(exam.id);
  const sectionByCode = Object.fromEntries(sections.map((s) => [s.code, s]));

  let totalSets = 0;
  let totalQuestions = 0;

  for (const [i, mock] of MOCKS.entries()) {
    // Seeded per mock, so adding a ninth mock does not change the first eight.
    const rng = makeRng(0x5e3d + i * 977);

    const { data: source, error: sourceError } = await db
      .from('mock_sources')
      .insert({
        user_id: userId,
        provider: mock.provider,
        title: `${SYNTH_PREFIX} ${mock.title}`,
        is_official_pyq: false,
      })
      .select('id')
      .single();
    if (sourceError) throw sourceError;

    const { data: attempt, error: attemptError } = await db
      .from('mock_attempts')
      .insert({
        user_id: userId,
        exam_id: exam.id,
        exam_config_id: config.id,
        source_id: source.id,
        taken_on: mock.date,
        timing_source: 'estimated',
        entry_mode: 'post_hoc_log',
        total_score: mock.varc + mock.dilr + mock.qa,
        percentile_reported: null,
        notes: 'Synthetic development data.',
        is_complete: true,
      })
      .select('id')
      .single();
    if (attemptError) throw attemptError;

    for (const code of ['VARC', 'DILR', 'QA']) {
      const section = sectionByCode[code];
      const score = mock[code.toLowerCase()];

      // quarter_marks is fabricated here because no v1 screen collects it (see
      // data-model.md — pacing is gated on its presence). The shape models this
      // student's third-quarter collapse in QA.
      const quarters =
        code === 'QA'
          ? [0.34, 0.30, 0.11, 0.25].map((f) => Math.round(score * f))
          : [0.28, 0.26, 0.24, 0.22].map((f) => Math.round(score * f));

      const { data: sa, error: saError } = await db
        .from('section_attempts')
        .insert({
          mock_attempt_id: attempt.id,
          section_id: section.id,
          score,
          time_used_sec: 40 * 60,
          quarter_marks: quarters,
        })
        .select('id')
        .single();
      if (saError) throw saError;

      if (code === 'DILR') {
        const sets = buildSets(rng, tax, i).map((s) => ({ ...s, section_attempt_id: sa.id }));
        const { error } = await db.from('set_attempts').insert(sets);
        if (error) throw error;
        totalSets += sets.length;
      } else {
        const profile = code === 'VARC' ? VARC_PROFILE : QA_PROFILE;
        const rows = buildQuestions(rng, profile, 1, tax, code === 'VARC').map((q) => ({
          ...q,
          section_attempt_id: sa.id,
          set_attempt_id: null,
        }));
        const { error } = await db.from('question_attempts').insert(rows);
        if (error) throw error;
        totalQuestions += rows.length;
      }
    }

    console.log(`  ${SYNTH_PREFIX} ${mock.title.padEnd(11)} ${mock.date}  total ${mock.varc + mock.dilr + mock.qa}`);
  }

  console.log(`\nseeded ${MOCKS.length} synthetic mocks, ${totalSets} sets, ${totalQuestions} question rows`);
  console.log(`remove with:  node --env-file=.env.local scripts/seed-dev-attempts.mjs --phone ${PHONE} --delete`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const userId = await resolveUserId();
  if (DELETE_MODE) {
    await deleteSynthetic(userId);
  } else {
    // Always clear first, so the script is idempotent rather than additive.
    await deleteSynthetic(userId);
    console.log('');
    await seed(userId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
