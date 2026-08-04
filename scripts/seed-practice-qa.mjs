/**
 * seed-practice-qa.mjs
 *
 * Seeds ASHA's first ORIGINAL practice paper: 14 Quantitative Ability questions,
 * assembled into one timed practice set.
 *
 *   npm run seed:practice
 *
 * REQUIRES migrations 0001–0009. Run with the SERVICE ROLE key.
 *
 * ─── WHY THIS CONTENT IS SAFE, AND WHAT WOULD NOT BE ─────────────────────────
 *
 * Every question here is written for ASHA. None is copied, adapted, or written
 * "in the style of" any real CAT, SimCAT, AIMCAT or past paper. They are standard
 * quantitative problems of the kind found in any textbook: the underlying
 * mathematics is not copyrightable, and the wording is original.
 *
 * That distinction is the entire legal position. CLAUDE.md forbids ingesting or
 * re-serving any exam's questions, because Indian courts treat exam papers as
 * copyrighted literary works (ICAI v. Shaunak H. Satya, (2011) 8 SCC 781) — and
 * because the intended model is licensing content FROM coaching institutes, which
 * holding their items without a licence would sabotage. So the source row below is
 * `kind = 'original'` and that is a claim this file has to keep being true. If
 * anyone adds a question here that came from a real paper, the claim becomes false
 * and the licensing position goes with it.
 *
 * ─── EVERY ANSWER IS RECOMPUTED, NOT TRUSTED ─────────────────────────────────
 *
 * Each question carries a `verify()` that derives its answer from first
 * principles — modular exponentiation for the remainder question, brute-force
 * permutation for the arrangement question, full enumeration of 36 outcomes for
 * the dice question. The script asserts the declared key matches before writing
 * anything.
 *
 * This is not ceremony. A wrong answer key is the single worst defect this file
 * could carry: it is invisible, it marks a correct student wrong, and it then
 * feeds that error into error-cause tagging and the confidence calibration — so
 * the student would be told they have a concept gap on a question they got right.
 * CLAUDE.md's content rule ("drafted, then independently verified before it is
 * written to a seed script") is satisfied by computation here rather than by a
 * second pair of eyes, because arithmetic admits of that.
 *
 * MARKING IS NOT STORED HERE. Marks come from `exam_configs` at grading time.
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
    console.error('\n  SEED FAILED: SUPABASE_URL must be the bare origin, with no path.\n');
    process.exit(1);
  }
}

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── Source and paper ────────────────────────────────────────────────────────

const SOURCE = {
  code: 'ASHA.ORIGINAL.V1',
  name: 'ASHA original questions, set 1',
  kind: 'original',
  owner_name: 'ASHA',
  licence_note:
    'Written for ASHA. Not derived from, adapted from, or modelled on any real CAT, '
    + 'SimCAT, AIMCAT or past paper. Freely usable by ASHA.',
  licence_expires_on: null,
  attribution_required: false,
  owner_user_id: null,
  active: true,
};

const PAPER = {
  code: 'ASHA.PRACTICE.QA.01',
  title: 'ASHA Practice — QA 1',
  description:
    '14 original quantitative questions. Not a full mock: a short set to practise '
    + 'pacing and see the analytics work on measured timings.',
  is_full_mock: false,
  // 25 minutes for 14 questions — close to CAT's own ~1.8 min/question, rather
  // than the full 40-minute section clock, which would train the wrong pacing.
  time_limit_min: 25,
  active: true,
  section_code: 'QA',
};

// ─── The questions ───────────────────────────────────────────────────────────
// mcq: `options` are the display strings; `option_values` are the same options as
// numbers, so the assertion below can check the KEY points at the right option
// rather than merely that a key exists.

const ITEMS = [
  {
    type: 'QA.ARITH.PCT', format: 'mcq', difficulty: 'easy',
    stem: 'A trader marks up the cost price of an article by 40% and then allows a discount of 25% on the marked price. What is the trader’s profit percentage?',
    options: ['3%', '5%', '10%', '15%'],
    option_values: [3, 5, 10, 15],
    correct_option: 2,
    solution: 'Selling price = 1.40 × 0.75 = 1.05 times the cost price, so the profit is 5%.',
    verify: () => (1.40 * 0.75 - 1) * 100,
  },
  {
    type: 'QA.ARITH.PLD', format: 'tita', difficulty: 'easy',
    stem: 'An article is sold for ₹1,320 at a profit of 10%. What was its cost price, in rupees?',
    correct_answer: '1200',
    solution: 'Cost price = 1320 / 1.10 = 1200.',
    verify: () => 1320 / 1.1,
  },
  {
    type: 'QA.ARITH.TSD', format: 'mcq', difficulty: 'easy',
    stem: 'A train 180 metres long passes a stationary pole in 9 seconds. What is the speed of the train, in km/h?',
    options: ['54', '63', '72', '81'],
    option_values: [54, 63, 72, 81],
    correct_option: 3,
    solution: 'Speed = 180 / 9 = 20 m/s. Multiplying by 18/5 gives 72 km/h.',
    verify: () => (180 / 9) * 3.6,
  },
  {
    type: 'QA.ARITH.WORK', format: 'tita', difficulty: 'moderate',
    stem: 'A can finish a piece of work in 12 days and B can finish the same work in 18 days. Working together, how many days will they take? Give your answer in days, correct to one decimal place.',
    correct_answer: '7.2',
    solution: 'Combined rate = 1/12 + 1/18 = 5/36 of the work per day, so the time taken is 36/5 = 7.2 days.',
    verify: () => 1 / (1 / 12 + 1 / 18),
  },
  {
    type: 'QA.ARITH.AVG', format: 'mcq', difficulty: 'easy',
    stem: 'The average of five numbers is 27. If one of the numbers, 15, is removed, what is the average of the remaining four?',
    options: ['28', '29', '30', '31'],
    option_values: [28, 29, 30, 31],
    correct_option: 3,
    solution: 'The five numbers total 135. Removing 15 leaves 120 across four numbers, so the average is 30.',
    verify: () => (5 * 27 - 15) / 4,
  },
  {
    type: 'QA.ARITH.RATIO', format: 'tita', difficulty: 'moderate',
    stem: 'If a : b = 3 : 4 and b : c = 6 : 7, and c = 56, what is the value of a?',
    correct_answer: '36',
    solution: 'From b : c = 6 : 7 and c = 56, b = 48. From a : b = 3 : 4, a = 36.',
    verify: () => { const c = 56, b = (c * 6) / 7; return (b * 3) / 4; },
  },
  {
    type: 'QA.ARITH.SICI', format: 'tita', difficulty: 'moderate',
    stem: '₹10,000 is invested at 10% per annum compound interest, compounded annually. What is the total interest earned over 2 years, in rupees?',
    correct_answer: '2100',
    solution: 'Amount = 10000 × 1.1² = 12100, so the interest is 2100.',
    verify: () => 10000 * Math.pow(1.1, 2) - 10000,
  },
  {
    type: 'QA.ALG.LINEAR', format: 'tita', difficulty: 'easy',
    stem: 'If 3x + 2y = 19 and x + y = 7, what is the value of x?',
    correct_answer: '5',
    solution: 'Substituting y = 7 − x into the first equation gives 3x + 14 − 2x = 19, so x = 5.',
    // Solved independently by elimination rather than by repeating the substitution.
    verify: () => { for (let x = -50; x <= 50; x += 1) { const y = 7 - x; if (3 * x + 2 * y === 19) return x; } return NaN; },
  },
  {
    type: 'QA.ALG.QUAD', format: 'mcq', difficulty: 'moderate',
    stem: 'The roots of x² − 7x + 12 = 0 are α and β. What is the value of α² + β²?',
    options: ['20', '24', '25', '49'],
    option_values: [20, 24, 25, 49],
    correct_option: 3,
    solution: 'α + β = 7 and αβ = 12, so α² + β² = 7² − 2(12) = 25.',
    // Found from the actual roots, not from the identity used in the solution.
    verify: () => { const r = []; for (let x = -20; x <= 20; x += 1) if (x * x - 7 * x + 12 === 0) r.push(x); return r[0] ** 2 + r[1] ** 2; },
  },
  {
    type: 'QA.ALG.PROG', format: 'mcq', difficulty: 'easy',
    stem: 'In an arithmetic progression, the first term is 5 and the common difference is 3. What is the 20th term?',
    options: ['59', '62', '65', '68'],
    option_values: [59, 62, 65, 68],
    correct_option: 2,
    solution: 'The nth term is 5 + (n − 1) × 3, so the 20th term is 5 + 57 = 62.',
    // Counted out term by term rather than using the formula.
    verify: () => { let t = 5; for (let i = 1; i < 20; i += 1) t += 3; return t; },
  },
  {
    type: 'QA.NUM.REM', format: 'tita', difficulty: 'hard',
    stem: 'What is the remainder when 2⁵⁰ is divided by 7?',
    correct_answer: '4',
    solution: '2³ = 8 leaves remainder 1 on division by 7. Since 50 = 3 × 16 + 2, the remainder is 2² = 4.',
    // Exact modular exponentiation with BigInt — no cycle argument, no floats.
    verify: () => Number((2n ** 50n) % 7n),
  },
  {
    type: 'QA.MODERN.PNC', format: 'tita', difficulty: 'moderate',
    stem: 'In how many distinct ways can the letters of the word LEVEL be arranged?',
    correct_answer: '30',
    solution: 'LEVEL has 5 letters with L twice and E twice, giving 5! / (2! × 2!) = 30 distinct arrangements.',
    // Brute force: generate every permutation and count the distinct strings.
    verify: () => {
      const seen = new Set();
      const permute = (arr, prefix = '') => {
        if (arr.length === 0) { seen.add(prefix); return; }
        for (let i = 0; i < arr.length; i += 1) {
          permute([...arr.slice(0, i), ...arr.slice(i + 1)], prefix + arr[i]);
        }
      };
      permute([...'LEVEL']);
      return seen.size;
    },
  },
  {
    type: 'QA.MODERN.PROB', format: 'mcq', difficulty: 'moderate',
    stem: 'Two fair six-sided dice are rolled. What is the probability that the sum of the numbers shown is 8?',
    options: ['1/9', '5/36', '1/6', '7/36'],
    option_values: [1 / 9, 5 / 36, 1 / 6, 7 / 36],
    correct_option: 2,
    solution: 'Of the 36 equally likely outcomes, 5 give a sum of 8: (2,6), (3,5), (4,4), (5,3) and (6,2).',
    // Full enumeration of the sample space.
    verify: () => {
      let hits = 0, total = 0;
      for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) { total += 1; if (a + b === 8) hits += 1; }
      return hits / total;
    },
  },
  {
    type: 'QA.GEOM.TRI', format: 'mcq', difficulty: 'easy',
    stem: 'A right-angled triangle has legs of length 9 cm and 12 cm. What is its area, in square centimetres?',
    options: ['45', '54', '60', '108'],
    option_values: [45, 54, 60, 108],
    correct_option: 2,
    solution: 'Area = ½ × 9 × 12 = 54 cm².',
    verify: () => 0.5 * 9 * 12,
  },
];

// ─── Assertions ──────────────────────────────────────────────────────────────

const CLOSE = 1e-9;

function fail(message) {
  console.error(`\n  SEED FAILED: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

/** Numeric comparison mirroring lib/grading.ts titaMatches, so the seed cannot
 *  declare an answer the app would then mark wrong. */
function numericEqual(a, b) {
  return Math.abs(a - b) < CLOSE;
}

function verifyItems() {
  console.log('recomputing every answer key from first principles...');

  const seenStems = new Set();

  for (const [i, item] of ITEMS.entries()) {
    const n = i + 1;
    const computed = item.verify();

    assert(Number.isFinite(computed), `Q${n}: verify() did not produce a finite number`);

    // A duplicated stem means a paper that asks the same thing twice.
    const norm = item.stem.toLowerCase().replace(/\s+/g, ' ');
    assert(!seenStems.has(norm), `Q${n}: duplicate stem`);
    seenStems.add(norm);

    if (item.format === 'mcq') {
      assert(Array.isArray(item.options) && item.options.length >= 2,
        `Q${n}: mcq needs at least 2 options`);
      assert(item.option_values.length === item.options.length,
        `Q${n}: option_values length does not match options`);
      assert(item.correct_option >= 1 && item.correct_option <= item.options.length,
        `Q${n}: correct_option ${item.correct_option} is out of range`);

      // THE CHECK THAT MATTERS: the keyed option must hold the computed answer.
      const keyed = item.option_values[item.correct_option - 1];
      assert(numericEqual(keyed, computed),
        `Q${n}: answer key points at option ${item.correct_option} (${item.options[item.correct_option - 1]} `
        + `= ${keyed}) but the computed answer is ${computed}`);

      // And no OTHER option may also equal it, or the question has two right answers.
      const alsoCorrect = item.option_values
        .map((v, idx) => ({ v, idx: idx + 1 }))
        .filter(o => o.idx !== item.correct_option && numericEqual(o.v, computed));
      assert(alsoCorrect.length === 0,
        `Q${n}: option${alsoCorrect.length > 1 ? 's' : ''} `
        + `${alsoCorrect.map(o => o.idx).join(', ')} also equal the correct answer`);
    } else {
      assert(typeof item.correct_answer === 'string' && item.correct_answer.trim().length > 0,
        `Q${n}: tita needs a correct_answer`);
      const declared = Number(item.correct_answer);
      assert(Number.isFinite(declared), `Q${n}: tita correct_answer is not numeric`);
      assert(numericEqual(declared, computed),
        `Q${n}: declared answer ${item.correct_answer} but the computed answer is ${computed}`);
    }

    console.log(`  ok  Q${String(n).padStart(2)}  ${item.type.padEnd(16)} ${item.format.padEnd(4)} → ${computed}`);
  }

  console.log(`all ${ITEMS.length} answer keys verified\n`);
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  verifyItems();

  const { data: exam, error: examError } = await db.from('exams')
    .select('id').eq('code', 'CAT').single();
  if (examError) throw examError;

  const { data: section, error: sectionError } = await db.from('sections')
    .select('id, code').eq('exam_id', exam.id).eq('code', PAPER.section_code).single();
  if (sectionError) throw sectionError;

  const { data: types, error: typeError } = await db.from('question_types')
    .select('id, code').eq('exam_id', exam.id).eq('kind', 'question_type');
  if (typeError) throw typeError;
  const typeByCode = Object.fromEntries(types.map(t => [t.code, t.id]));

  for (const item of ITEMS) {
    assert(typeByCode[item.type], `taxonomy code '${item.type}' does not exist for CAT`);
  }

  const { data: source, error: sourceError } = await db.from('content_sources')
    .upsert(SOURCE, { onConflict: 'code' }).select().single();
  if (sourceError) throw sourceError;
  console.log(`source: ${source.code} (${source.kind})`);

  const { section_code, ...paperRow } = PAPER;
  const { data: paper, error: paperError } = await db.from('practice_papers')
    .upsert({ ...paperRow, source_id: source.id, exam_id: exam.id }, { onConflict: 'code' })
    .select().single();
  if (paperError) throw paperError;
  console.log(`paper:  ${paper.code} — ${paper.time_limit_min} min`);

  // Rebuild the paper's contents from scratch. Items have no natural key to upsert
  // on, so a re-run replaces rather than accumulates. Safe because this content is
  // ASHA's own and carries no student data; `question_attempts.question_item_id` is
  // ON DELETE SET NULL, so an existing attempt survives with its grading intact.
  const { error: clearError } = await db.from('paper_items')
    .delete().eq('paper_id', paper.id);
  if (clearError) throw clearError;
  const { error: dropError } = await db.from('question_items')
    .delete().eq('source_id', source.id);
  if (dropError) throw dropError;

  let number = 0;
  for (const item of ITEMS) {
    number += 1;
    const { data: written, error: itemError } = await db.from('question_items').insert({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      stimulus_id: null,
      question_type_id: typeByCode[item.type],
      passage_domain_id: null,
      stem: item.stem,
      response_format: item.format,
      options: item.format === 'mcq' ? item.options : null,
      correct_option: item.format === 'mcq' ? item.correct_option : null,
      correct_answer: item.format === 'tita' ? item.correct_answer : null,
      solution: item.solution,
      difficulty: item.difficulty,
      active: true,
    }).select().single();
    if (itemError) throw itemError;

    const { error: linkError } = await db.from('paper_items').insert({
      paper_id: paper.id,
      question_item_id: written.id,
      section_id: section.id,
      question_number: number,
    });
    if (linkError) throw linkError;
  }
  console.log(`items:  ${number} written and linked`);

  // ─── Read it back ──────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  const { count: itemCount, error: countError } = await db.from('question_items')
    .select('*', { count: 'exact', head: true }).eq('source_id', source.id);
  if (countError) throw countError;
  assert(itemCount === ITEMS.length, `db items: expected ${ITEMS.length}, found ${itemCount}`);
  console.log(`  ok  db items: ${itemCount}`);

  const { data: linked, error: linkedError } = await db.from('paper_items')
    .select('question_number, question_items(response_format, correct_option, correct_answer, options)')
    .eq('paper_id', paper.id).order('question_number');
  if (linkedError) throw linkedError;

  assert(linked.length === ITEMS.length,
    `db paper_items: expected ${ITEMS.length}, found ${linked.length}`);

  // Numbering must be a gapless 1..n, or the runner would show "Question 13 of 14"
  // with no thirteenth question.
  const numbers = linked.map(r => r.question_number);
  const expected = Array.from({ length: ITEMS.length }, (_, i) => i + 1);
  assert(JSON.stringify(numbers) === JSON.stringify(expected),
    `db question_numbers are not a gapless 1..${ITEMS.length}: got ${numbers.join(',')}`);
  console.log(`  ok  db numbering: gapless 1..${ITEMS.length}`);

  // Every stored item must still be gradable — the check constraints should make
  // this impossible to violate, which is exactly why it is worth confirming.
  for (const row of linked) {
    const q = row.question_items;
    if (q.response_format === 'mcq') {
      assert(Array.isArray(q.options) && q.correct_option >= 1 && q.correct_option <= q.options.length,
        `db Q${row.question_number}: mcq key out of range`);
      assert(q.correct_answer === null, `db Q${row.question_number}: mcq carries a tita answer`);
    } else {
      assert(typeof q.correct_answer === 'string' && q.correct_answer.length > 0,
        `db Q${row.question_number}: tita has no answer`);
      assert(q.options === null && q.correct_option === null,
        `db Q${row.question_number}: tita carries mcq fields`);
    }
  }
  console.log('  ok  db every item is gradable');

  const { data: src, error: srcError } = await db.from('content_sources')
    .select('kind, owner_user_id').eq('id', source.id).single();
  if (srcError) throw srcError;
  assert(src.kind === 'original',
    `db source kind is '${src.kind}' — this script may only write original content`);
  assert(src.owner_user_id === null, 'db source must not be tied to a user');
  console.log("  ok  db source kind = 'original'");

  console.log(
    `\nseeded: ${ITEMS.length} original QA questions as "${paper.title}" `
    + `(${paper.time_limit_min} min), paper active.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
