/**
 * seed-practice-dilr.mjs
 *
 * Seeds ASHA's original DILR content: three sets of four questions each.
 *
 *   npm run seed:dilr
 *
 * REQUIRES migrations 0001–0009. Run with the SERVICE ROLE key.
 * Owns the source `ASHA.ORIGINAL.DILR.V1` and deletes only within it.
 *
 * ─── PRACTICE DILR IS QUESTION-LEVEL, WHICH THE LOGGING FLOW IS NOT ──────────
 *
 * Everywhere else in ASHA, DILR is recorded at SET level: the student is replaying a
 * mock taken elsewhere, they never captured per-question data, and the decision
 * worth analysing is which sets they picked and which they walked past.
 *
 * A practice run is different in kind. ASHA holds the questions and times each one,
 * so it records per-question outcomes AND the order worked in — strictly more than
 * the logging flow can obtain. So a DILR practice paper is question-level, and each
 * question is tagged with a `DILR.SKILL.*` leaf.
 *
 * **That un-reserves four taxonomy nodes.** `docs/data-model.md` has listed
 * `DILR.SKILL.*` under "Reserved in practice" since v1, with the reason: "DILR is
 * logged at set level in v1, so no DILR question rows exist to carry a skill tag."
 * These are the first rows that ever will.
 *
 * The set itself is a `question_stimuli` row with `kind = 'set_data'` and an
 * `archetype_id`, so the archetype is still recorded — the set-selection playbook's
 * raw material is not lost, it is simply attached to the exhibit rather than to a
 * `set_attempts` row.
 *
 * ─── EVERY KEY IS COMPUTED BY SOLVING THE SET FROM SCRATCH ───────────────────
 *
 * Unlike reading comprehension, DILR answers are not judgement calls: a
 * well-constructed set has exactly one solution, and finding it is mechanical. So
 * each set carries a `solve()` that enumerates the entire possibility space and
 * filters by the stated conditions. The seed asserts the solution is UNIQUE — an
 * ambiguous set is worse than a wrong one, because it looks fine and marks a
 * correctly-reasoning student wrong — and then derives each answer from that
 * solution rather than from anything declared by hand.
 *
 * The "what if" questions re-run the solver against modified conditions, so their
 * answers are computed too.
 *
 * ─── CONTENT PROVENANCE ──────────────────────────────────────────────────────
 *
 * All three sets were written for ASHA. Not taken from, adapted from, or modelled on
 * any real CAT, SimCAT or AIMCAT set.
 */

import { createClient } from '@supabase/supabase-js';

const MISSING = [
  ['SUPABASE_URL', 'Project Settings → API → Project URL'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API → service_role key'],
].filter(([name]) => !process.env[name]?.trim());

if (MISSING.length) {
  console.error('\n  SEED FAILED: missing environment variables in .env.local\n');
  for (const [name, where] of MISSING) console.error(`    ${name}\n      ${where}\n`);
  process.exit(1);
}
{
  const parsed = new URL(process.env.SUPABASE_URL.trim());
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    console.error('\n  SEED FAILED: SUPABASE_URL must be the bare origin.\n');
    process.exit(1);
  }
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const SOURCE = {
  code: 'ASHA.ORIGINAL.DILR.V1',
  name: 'ASHA original DILR content, set 1',
  kind: 'original',
  owner_name: 'ASHA',
  licence_note:
    'Sets and questions written for ASHA. Not taken from, adapted from or modelled on '
    + 'any real CAT, SimCAT or AIMCAT set.',
  licence_expires_on: null,
  attribution_required: false,
  owner_user_id: null,
  active: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** All permutations of an array. Used to enumerate arrangement possibilities. */
function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

/** Every truth assignment over n people: arrays of true (truthful) / false (liar). */
function assignments(n) {
  const out = [];
  for (let mask = 0; mask < 2 ** n; mask += 1) {
    out.push(Array.from({ length: n }, (_, i) => Boolean((mask >> i) & 1)));
  }
  return out;
}

// ─── Set 1: Arrangements ─────────────────────────────────────────────────────

const ARRANGE = {
  key: 'ARRANGE',
  archetype: 'DILR.ARCH.ARRANGE',
  title: 'Set 1 — five seats in a row',
  body: [
    'Five people — P, Q, R, S and T — occupy five seats in a single row, numbered 1 to 5 from left to right. Each seat is taken by exactly one person.',
    'The following is known:',
    '  (i)   P sits immediately to the right of T.\n  (ii)  R sits immediately to the left of S.\n  (iii) Exactly two people sit between P and Q.',
  ].join('\n\n'),

  /**
   * Enumerates all 120 seatings and keeps those meeting the conditions.
   *
   * `variant` lets a "what if" question re-solve against an altered condition, so
   * its answer is computed rather than reasoned out by hand. That is not a
   * nicety: the first version of question 4 varied condition (iii) instead, and the
   * uniqueness assertion caught that the altered set had TWO solutions — which the
   * hand-written explanation had confidently denied.
   */
  solve(variant = {}) {
    const between = variant.between ?? 2;
    const pLeftOfT = variant.pLeftOfT ?? false;
    const people = ['P', 'Q', 'R', 'S', 'T'];
    return permutations(people).filter((row) => {
      const at = (name) => row.indexOf(name);
      // (i) P immediately right of T — or its mirror, for the variant.
      if (pLeftOfT ? at('T') !== at('P') + 1 : at('P') !== at('T') + 1) return false;
      // (ii) S immediately right of R.
      if (at('S') !== at('R') + 1) return false;
      // (iii) exactly `between` people between P and Q.
      if (Math.abs(at('P') - at('Q')) - 1 !== between) return false;
      return true;
    });
  },
};

// ─── Set 2: Binary logic ─────────────────────────────────────────────────────

const BINARY = {
  key: 'BINARY',
  archetype: 'DILR.ARCH.BINARY',
  title: 'Set 2 — three statements',
  body: [
    'Each of three people — A, B and C — is either a truth-teller, who makes only true statements, or a liar, who makes only false statements.',
    'They say the following:',
    '  A: “B is a liar.”\n  B: “C is a liar.”\n  C: “A and B are both liars.”',
  ].join('\n\n'),

  /**
   * Enumerates all 8 truth assignments and keeps those under which every person's
   * statement has the truth value their type requires.
   */
  solve(variant = 'original') {
    return assignments(3).filter(([a, b, c]) => {
      const claimA = !b;                     // "B is a liar"
      const claimB = !c;                      // "C is a liar"
      const claimC =
        variant === 'original' ? (!a && !b)   // "A and B are both liars"
        : variant === 'a-truthful' ? a         // "A is a truth-teller"
        : (() => { throw new Error(`unknown variant ${variant}`); })();
      return a === claimA && b === claimB && c === claimC;
    });
  },
};

// ─── Set 3: Quant caselet ────────────────────────────────────────────────────

const CASELET = {
  key: 'CASELET',
  archetype: 'DILR.ARCH.CASELET',
  // Deliberately column-aligned: the runner renders set_data in mono with
  // whitespace preserved, so this table survives on a 360px screen.
  title: 'Set 3 — four shops, three months',
  data: {
    shops: ['A', 'B', 'C', 'D'],
    months: ['Apr', 'May', 'Jun'],
    sales: {
      A: [120, 150, 180],
      B: [200, 180, 160],
      C: [90, 135, 180],
      D: [160, 160, 200],
    },
  },
  get body() {
    const { shops, months, sales } = this.data;
    const header = `Shop     ${months.map(m => m.padStart(5)).join('  ')}`;
    const rows = shops.map(s => `  ${s}      ${sales[s].map(v => String(v).padStart(5)).join('  ')}`);
    return [
      'The table below shows the sales, in thousands of rupees, of four shops over three months.',
      [header, '-'.repeat(header.length), ...rows].join('\n'),
      'All figures are exact.',
    ].join('\n\n');
  },

  total(shop) { return this.data.sales[shop].reduce((a, b) => a + b, 0); },
  monthTotal(i) { return this.data.shops.reduce((sum, s) => sum + this.data.sales[s][i], 0); },
};

// ─── Questions ───────────────────────────────────────────────────────────────
// `answer` is a FUNCTION of the solved set, never a declared constant.

const SETS = [ARRANGE, BINARY, CASELET];

const QUESTIONS = [
  // ── Set 1 ──
  {
    set: 'ARRANGE', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'moderate',
    stem: 'Who occupies seat 3?',
    options: ['P', 'Q', 'R', 'S'],
    answer: () => ARRANGE.solve()[0][2],
    solution:
      'Condition (i) forces T into seat 1 and P into seat 2, since P must have a seat to its left. '
      + 'R and S then take 3 and 4 or 4 and 5; the second leaves Q in seat 3, only one seat from P, '
      + 'which breaks (iii). So the row is T, P, R, S, Q and seat 3 holds R.',
  },
  {
    set: 'ARRANGE', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'easy',
    stem: 'Which two people occupy the two end seats?',
    options: ['P and Q', 'T and Q', 'T and S', 'R and Q'],
    answer: () => { const r = ARRANGE.solve()[0]; return `${r[0]} and ${r[4]}`; },
    solution: 'The unique arrangement is T, P, R, S, Q, so the ends are T and Q.',
  },
  {
    set: 'ARRANGE', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'easy',
    stem: 'How many people sit between R and Q?',
    answer: () => { const r = ARRANGE.solve()[0]; return Math.abs(r.indexOf('R') - r.indexOf('Q')) - 1; },
    solution: 'R is in seat 3 and Q in seat 5, so exactly one person — S — sits between them.',
  },
  {
    set: 'ARRANGE', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'hard',
    stem: 'Suppose condition (i) is replaced by “P sits immediately to the LEFT of T”, with (ii) and (iii) unchanged. Who then occupies seat 5?',
    options: ['P', 'Q', 'R', 'T'],
    // Computed by re-running the solver against the altered condition, and asserted
    // to still be unique before anything is written.
    answer: () => { const s = ARRANGE.solve({ pLeftOfT: true }); return s.length === 1 ? s[0][4] : `AMBIGUOUS(${s.length})`; },
    solution:
      'P and T must now be adjacent with T on the right, and (iii) still requires three seats '
      + 'between P and Q. Taking each possible position for the P–T pair in turn, only P in seat 4 '
      + 'and T in seat 5 survives: R and S then take seats 2 and 3, and Q takes seat 1, which is '
      + 'three seats from P as required. The row is Q, R, S, P, T, so seat 5 holds T.',
  },

  // ── Set 2 ──
  {
    set: 'BINARY', skill: 'DILR.SKILL.DEDUCE', format: 'tita', difficulty: 'moderate',
    stem: 'How many of the three are truth-tellers?',
    answer: () => BINARY.solve()[0].filter(Boolean).length,
    solution:
      'Only one assignment is consistent: A lies, B tells the truth, C lies. So exactly one of the '
      + 'three is a truth-teller.',
  },
  {
    set: 'BINARY', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'moderate',
    stem: 'Which of the following is true?',
    options: [
      'A is a truth-teller and B is a liar.',
      'A is a liar and B is a truth-teller.',
      'Both A and C are truth-tellers.',
      'All three are liars.',
    ],
    answer: () => {
      const [a, b] = BINARY.solve()[0];
      return `${a ? 'A is a truth-teller' : 'A is a liar'} and ${b ? 'B is a truth-teller' : 'B is a liar'}.`;
    },
    solution:
      'If A told the truth, B would be a liar, so B\'s claim that C lies would be false, making C a '
      + 'truth-teller — but then C\'s claim that A and B both lie would have to be true, contradicting '
      + 'A being truthful. So A lies, which makes B truthful, which makes C a liar. C lying is '
      + 'consistent, since A and B are not both liars.',
  },
  {
    set: 'BINARY', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'easy',
    stem: 'What can be concluded about C?',
    options: ['C is a truth-teller', 'C is a liar', 'C could be either', 'C’s statement is self-contradictory'],
    answer: () => (BINARY.solve()[0][2] ? 'C is a truth-teller' : 'C is a liar'),
    solution: 'C is a liar in the only consistent assignment, so it is determined rather than open.',
  },
  {
    set: 'BINARY', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'hard',
    stem: 'Suppose C had instead said “A is a truth-teller”, with A’s and B’s statements unchanged. How many assignments of types to A, B and C would then be consistent?',
    // Computed by re-solving with the altered statement.
    answer: () => BINARY.solve('a-truthful').length,
    solution:
      'Two survive. A truthful with B lying and C truthful is consistent; so is A lying with B '
      + 'truthful and C lying. The original set was uniquely determined only because C\'s stronger '
      + 'claim ruled the first of these out.',
  },

  // ── Set 3 ──
  {
    set: 'CASELET', skill: 'DILR.SKILL.READ', format: 'mcq', difficulty: 'easy',
    stem: 'Which shop had the highest total sales across the three months?',
    options: ['A', 'B', 'C', 'D'],
    answer: () => CASELET.data.shops.reduce((best, s) => (CASELET.total(s) > CASELET.total(best) ? s : best)),
    solution: 'Totals are A 450, B 540, C 405 and D 520, so B is highest.',
  },
  {
    set: 'CASELET', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'moderate',
    stem: 'By what percentage did shop C’s sales increase from April to June?',
    answer: () => {
      const [apr, , jun] = CASELET.data.sales.C;
      return ((jun - apr) / apr) * 100;
    },
    solution: 'C rose from 90 to 180, which is a doubling — an increase of 100%.',
  },
  {
    set: 'CASELET', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'moderate',
    stem: 'By how much (in thousands of rupees) did the combined sales of all four shops rise from April to June?',
    answer: () => CASELET.monthTotal(2) - CASELET.monthTotal(0),
    solution: 'April totals 570 and June totals 720, a rise of 150 thousand rupees.',
  },
  {
    set: 'CASELET', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'hard',
    stem: 'For how many of the four shops did sales increase in every month compared with the month before?',
    answer: () => CASELET.data.shops.filter((s) => {
      const v = CASELET.data.sales[s];
      return v[1] > v[0] && v[2] > v[1];
    }).length,
    solution:
      'A (120, 150, 180) and C (90, 135, 180) rise every month. B falls throughout. D is flat from '
      + 'April to May, and flat is not an increase — which is the trap.',
  },
];

// ─── Assertions ──────────────────────────────────────────────────────────────

function fail(message) { console.error(`\n  SEED FAILED: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }

const setByKey = Object.fromEntries(SETS.map(s => [s.key, s]));

function verifyContent() {
  console.log('solving every set from scratch...\n');

  // A set with more than one solution is worse than a wrong one: it looks fine and
  // marks a correctly-reasoning student wrong.
  for (const key of ['ARRANGE', 'BINARY']) {
    const solutions = setByKey[key].solve();
    assert(solutions.length === 1,
      `${key}: expected exactly 1 solution, found ${solutions.length} — an ambiguous set must not ship`);
    console.log(`  ok  ${key.padEnd(9)} unique solution: ${JSON.stringify(solutions[0])}`);
  }
  // The caselet is arithmetic over declared data; there is nothing to be ambiguous.
  console.log(`  ok  CASELET   totals ${CASELET.data.shops.map(s => `${s}=${CASELET.total(s)}`).join(' ')}`);
  console.log('');

  const seenStems = new Set();
  for (const [i, q] of QUESTIONS.entries()) {
    const n = i + 1;
    assert(setByKey[q.set], `Q${n}: unknown set '${q.set}'`);

    const computed = q.answer();
    assert(computed !== undefined && computed !== null, `Q${n}: answer() returned nothing`);
    assert(!String(computed).startsWith('AMBIGUOUS'),
      `Q${n}: the modified conditions do not yield a unique solution (${computed})`);

    const stemKey = q.stem.toLowerCase().replace(/\s+/g, ' ');
    assert(!seenStems.has(stemKey), `Q${n}: duplicate stem`);
    seenStems.add(stemKey);

    if (q.format === 'mcq') {
      assert(q.options.length === 4, `Q${n}: expected 4 options, got ${q.options.length}`);
      assert(new Set(q.options.map(o => o.toLowerCase())).size === 4, `Q${n}: duplicate options`);
      // THE CHECK THAT MATTERS: the computed answer must be one of the options, and
      // the key is derived from WHICH one rather than declared.
      const idx = q.options.findIndex(o => o === String(computed));
      assert(idx !== -1,
        `Q${n}: the computed answer ${JSON.stringify(String(computed))} is not among the options `
        + `${JSON.stringify(q.options)}`);
      q._correctOption = idx + 1;
      console.log(`  ok  Q${String(n).padStart(2)}  ${q.set.padEnd(8)} ${q.skill.padEnd(18)} mcq  → option ${q._correctOption} (${computed})`);
    } else {
      // Numeric answers are normalised the way lib/grading.ts compares them, so the
      // seed cannot store a form the app would mark wrong.
      const num = Number(computed);
      assert(Number.isFinite(num), `Q${n}: tita answer ${computed} is not numeric`);
      q._correctAnswer = String(Math.round(num * 1e6) / 1e6);
      console.log(`  ok  Q${String(n).padStart(2)}  ${q.set.padEnd(8)} ${q.skill.padEnd(18)} tita → ${q._correctAnswer}`);
    }
  }

  // All four DILR skills must appear, since these are the first rows ever to carry
  // one and a gap would leave a permanently empty analytics bucket.
  const skills = new Set(QUESTIONS.map(q => q.skill));
  const expected = ['DILR.SKILL.CALC', 'DILR.SKILL.COUNT', 'DILR.SKILL.DEDUCE', 'DILR.SKILL.READ'];
  const missing = expected.filter(s => !skills.has(s));
  assert(missing.length === 0, `DILR skills with no question: ${missing.join(', ')}`);
  console.log(`\n  ok  all ${expected.length} DILR skills covered across ${SETS.length} archetypes`);

  console.log(`\ncontent ok: ${SETS.length} sets, ${QUESTIONS.length} questions\n`);
}

// ─── Seed ────────────────────────────────────────────────────────────────────

const PAPER = {
  code: 'ASHA.PRACTICE.DILR.01',
  title: 'ASHA Practice — DILR 1',
  description:
    'Three sets of four questions: an arrangement, a truth-teller puzzle, and a '
    + 'data caselet. Shorter than a real DILR section, which runs 22 questions in 40 '
    + 'minutes across five sets.',
  is_full_mock: false,
  // 12 questions at 120 s — slightly above CAT's 109 s average, because a set must
  // be read and cracked before any of its questions can be answered.
  time_limit_min: 24,
  active: true,
};

async function main() {
  verifyContent();

  const { data: exam, error: ee } = await db.from('exams').select('id').eq('code', 'CAT').single();
  if (ee) throw ee;
  const { data: section, error: se } = await db.from('sections')
    .select('id').eq('exam_id', exam.id).eq('code', 'DILR').single();
  if (se) throw se;

  const { data: types, error: te } = await db.from('question_types').select('id, code').eq('exam_id', exam.id);
  if (te) throw te;
  const byCode = Object.fromEntries(types.map(t => [t.code, t.id]));
  for (const code of [...new Set([...QUESTIONS.map(q => q.skill), ...SETS.map(s => s.archetype)])]) {
    assert(byCode[code], `taxonomy code '${code}' does not exist for CAT`);
  }

  const { data: source, error: sre } = await db.from('content_sources')
    .upsert(SOURCE, { onConflict: 'code' }).select().single();
  if (sre) throw sre;
  console.log(`source: ${source.code} (${source.kind})`);

  const { data: oldPapers } = await db.from('practice_papers').select('id').eq('source_id', source.id);
  for (const p of oldPapers ?? []) {
    const { error } = await db.from('paper_items').delete().eq('paper_id', p.id);
    if (error) throw error;
  }
  await db.from('question_items').delete().eq('source_id', source.id);
  await db.from('question_stimuli').delete().eq('source_id', source.id);

  const stimulusByKey = {};
  for (const s of SETS) {
    const { data, error } = await db.from('question_stimuli').insert({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      kind: 'set_data',
      title: s.title,
      body: s.body,
      passage_domain_id: null,
      // The archetype stays recorded, on the exhibit rather than on a set_attempts
      // row — so the set-selection playbook's raw material is not thrown away.
      archetype_id: byCode[s.archetype],
      active: true,
    }).select().single();
    if (error) throw error;
    stimulusByKey[s.key] = data.id;
  }
  console.log(`sets:   ${Object.keys(stimulusByKey).length} written`);

  const itemIds = [];
  for (const q of QUESTIONS) {
    const { data, error } = await db.from('question_items').insert({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      stimulus_id: stimulusByKey[q.set],
      question_type_id: byCode[q.skill],
      passage_domain_id: null,
      stem: q.stem,
      response_format: q.format,
      options: q.format === 'mcq' ? q.options : null,
      correct_option: q.format === 'mcq' ? q._correctOption : null,
      correct_answer: q.format === 'tita' ? q._correctAnswer : null,
      solution: q.solution,
      difficulty: q.difficulty,
      active: true,
    }).select().single();
    if (error) throw error;
    itemIds.push(data.id);
  }
  console.log(`items:  ${itemIds.length} written`);

  const { data: paper, error: pe } = await db.from('practice_papers')
    .upsert({ ...PAPER, source_id: source.id, exam_id: exam.id }, { onConflict: 'code' })
    .select().single();
  if (pe) throw pe;

  for (const [i, id] of itemIds.entries()) {
    const { error } = await db.from('paper_items').insert({
      paper_id: paper.id, question_item_id: id,
      section_id: section.id, question_number: i + 1,
    });
    if (error) throw error;
  }
  console.log(`paper:  ${paper.code} — ${itemIds.length} questions, ${paper.time_limit_min} min`);

  // ─── Read back ─────────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  const { data: linked, error: le } = await db.from('paper_items')
    .select('question_number, question_items(response_format, correct_option, correct_answer, options, stimulus_id, question_stimuli(kind, body, archetype_id))')
    .eq('paper_id', paper.id).order('question_number');
  if (le) throw le;

  assert(linked.length === itemIds.length, `db items: expected ${itemIds.length}, found ${linked.length}`);
  const numbers = linked.map(r => r.question_number);
  assert(JSON.stringify(numbers) === JSON.stringify(numbers.map((_, i) => i + 1)),
    `db numbering not gapless: ${numbers.join(',')}`);
  console.log(`  ok  db items: ${linked.length}, gapless numbering`);

  for (const row of linked) {
    const q = row.question_items;
    const stim = Array.isArray(q.question_stimuli) ? q.question_stimuli[0] : q.question_stimuli;
    assert(q.stimulus_id && stim, `db Q${row.question_number}: no set attached`);
    assert(stim.kind === 'set_data', `db Q${row.question_number}: stimulus kind is '${stim.kind}'`);
    assert(stim.archetype_id !== null, `db Q${row.question_number}: set has no archetype tagged`);
    // Line breaks must survive the round trip, or the runner renders a table as one
    // unreadable run-on line.
    assert(stim.body.includes('\n'), `db Q${row.question_number}: set data lost its line breaks`);
    if (q.response_format === 'mcq') {
      assert(q.correct_option >= 1 && q.correct_option <= q.options.length,
        `db Q${row.question_number}: mcq key out of range`);
    } else {
      assert(typeof q.correct_answer === 'string' && q.correct_answer.length > 0,
        `db Q${row.question_number}: tita has no answer`);
    }
  }
  console.log('  ok  db every question carries a set_data exhibit with an archetype');
  console.log('  ok  db set data kept its line breaks');
  console.log('  ok  db every item is gradable');

  console.log(
    `\nseeded: ${SETS.length} original DILR sets and ${QUESTIONS.length} questions as `
    + `"${paper.title}" (${paper.time_limit_min} min).\n`
    + `Every key was computed by solving the set from scratch; both logic sets were\n`
    + `asserted to have exactly one solution. DILR.SKILL.* is no longer reserved.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
