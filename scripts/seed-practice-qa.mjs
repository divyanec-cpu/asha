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

/**
 * Papers are assembled FROM the item pool below, so adding a paper is data rather
 * than code. `take` selects which items, by position in ITEMS — the order in that
 * array is deliberate and documented there.
 *
 * Times are set at roughly CAT's own 1.8 min/question (40 minutes for 22 QA
 * questions), never inherited from the section clock. Handing a short set the full
 * 40 minutes would train the wrong pacing, which is why migration 0009 requires a
 * partial paper to declare its own limit.
 */
const PAPERS = [
  {
    code: 'ASHA.PRACTICE.QA.01',
    title: 'ASHA Practice — QA 1',
    description:
      '14 original quantitative questions. A short warm-up set to practise pacing '
      + 'and see the analytics work on measured timings.',
    is_full_mock: false,
    time_limit_min: 25,
    active: true,
    section_code: 'QA',
    take: items => items.slice(0, 14),
  },
  {
    code: 'ASHA.PRACTICE.QA.02',
    title: 'ASHA Practice — QA Coverage',
    description:
      'One question on every CAT quantitative topic ASHA tracks — 31 questions, '
      + 'longer than a real QA section. Built to find your weak topics fast, so it '
      + 'is deliberately not all hard.',
    is_full_mock: false,
    // 31 questions at ~1.8 min each, matching CAT's own pace.
    time_limit_min: 56,
    active: true,
    section_code: 'QA',
    take: items => items.slice(0, 31),
  },
  {
    code: 'ASHA.PRACTICE.QA.03',
    title: 'ASHA Practice — QA Challenge',
    description:
      '12 hard questions on the topics CAT leans on most. Pitched at real CAT '
      + 'difficulty, and every wrong option is a mistake someone actually makes — so '
      + 'what you pick says where you went wrong.',
    is_full_mock: false,
    // Harder questions need longer: 2.5 min each rather than CAT's 1.8 average.
    time_limit_min: 30,
    active: true,
    section_code: 'QA',
    take: items => items.slice(31),
  },
];

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

  // ─── Batch 2 (2026-08-04) ──────────────────────────────────────────────────
  // Seventeen questions covering the seventeen QA taxonomy leaves the first batch
  // left untouched. With these, every one of CAT's 31 seeded QA question types has
  // exactly one question — which is what makes a per-type reading meaningful rather
  // than an artefact of which topics happened to get written first.

  {
    type: 'QA.NUM.FACT', format: 'tita', difficulty: 'moderate',
    stem: 'How many positive factors does 720 have?',
    correct_answer: '30',
    solution: '720 = 2⁴ × 3² × 5, so the number of factors is (4+1)(2+1)(1+1) = 30.',
    // Counted by trial division, not by the exponent formula used in the solution.
    verify: () => { let n = 0; for (let d = 1; d <= 720; d += 1) if (720 % d === 0) n += 1; return n; },
  },
  {
    type: 'QA.NUM.DIV', format: 'tita', difficulty: 'easy',
    stem: 'What is the largest three-digit number that is divisible by both 12 and 18?',
    correct_answer: '972',
    solution: 'The LCM of 12 and 18 is 36. The largest multiple of 36 below 1000 is 27 × 36 = 972.',
    verify: () => { for (let n = 999; n >= 100; n -= 1) if (n % 12 === 0 && n % 18 === 0) return n; return NaN; },
  },
  {
    type: 'QA.NUM.BASE', format: 'mcq', difficulty: 'moderate',
    stem: 'The decimal number 45, written in base 3, is:',
    options: ['1120', '1200', '1210', '2100'],
    option_values: [1120, 1200, 1210, 2100],
    correct_option: 2,
    solution: '45 = 1×27 + 2×9 + 0×3 + 0, so the base-3 representation is 1200.',
    // Converted digit by digit, then read back as a decimal numeral for comparison.
    verify: () => { let n = 45, s = ''; while (n > 0) { s = String(n % 3) + s; n = Math.floor(n / 3); } return Number(s); },
  },
  {
    type: 'QA.ARITH.MIX', format: 'tita', difficulty: 'moderate',
    stem: 'A 40-litre mixture contains 10% acid. How many litres of water must be added so that the acid concentration becomes 8%?',
    correct_answer: '10',
    solution: 'The acid is 4 litres and does not change. For 4 litres to be 8% of the mixture, the total must be 50 litres, so 10 litres of water are added.',
    // Solved from the invariant (acid volume) rather than by repeating the algebra.
    verify: () => { const acid = 40 * 0.10; return acid / 0.08 - 40; },
  },
  {
    type: 'QA.ALG.LOG', format: 'tita', difficulty: 'hard',
    stem: 'If log₂ x + log₂ (x − 2) = 3, what is the value of x?',
    correct_answer: '4',
    solution: 'The equation gives x(x − 2) = 8, so x² − 2x − 8 = 0 and x = 4 or x = −2. Only x = 4 lies in the domain, since both x and x − 2 must be positive.',
    // Brute-forced against the ORIGINAL logarithmic equation, including its domain —
    // so a root that satisfies the quadratic but not the logs cannot slip through.
    verify: () => {
      for (let x = 1; x <= 100; x += 1) {
        if (x > 2 && Math.abs(Math.log2(x) + Math.log2(x - 2) - 3) < 1e-9) return x;
      }
      return NaN;
    },
  },
  {
    type: 'QA.ALG.INEQ', format: 'tita', difficulty: 'moderate',
    stem: 'How many integers satisfy | x − 3 | < 5 ?',
    correct_answer: '9',
    solution: 'The inequality means −2 < x < 8, so x runs over the integers −1 to 7 inclusive: nine values.',
    verify: () => { let n = 0; for (let x = -50; x <= 50; x += 1) if (Math.abs(x - 3) < 5) n += 1; return n; },
  },
  {
    type: 'QA.ALG.IDENT', format: 'mcq', difficulty: 'moderate',
    stem: 'If a + b = 7 and ab = 12, what is the value of a³ + b³?',
    options: ['63', '91', '127', '175'],
    option_values: [63, 91, 127, 175],
    correct_option: 2,
    solution: 'a³ + b³ = (a + b)³ − 3ab(a + b) = 343 − 3(12)(7) = 91.',
    // Found from the actual roots, not from the identity quoted in the solution.
    verify: () => {
      for (let a = -20; a <= 20; a += 1) { const b = 7 - a; if (a * b === 12) return a ** 3 + b ** 3; }
      return NaN;
    },
  },
  {
    type: 'QA.ALG.POLY', format: 'tita', difficulty: 'easy',
    stem: 'What is the remainder when x³ − 4x² + 5x − 2 is divided by (x − 3)?',
    correct_answer: '4',
    solution: 'By the remainder theorem the answer is f(3) = 27 − 36 + 15 − 2 = 4.',
    verify: () => { const f = x => x ** 3 - 4 * x ** 2 + 5 * x - 2; return f(3); },
  },
  {
    type: 'QA.ALG.FUNC', format: 'mcq', difficulty: 'easy',
    stem: 'If f(x) = 2x + 3 and g(x) = x², what is the value of f(g(2))?',
    options: ['7', '11', '19', '49'],
    option_values: [7, 11, 19, 49],
    correct_option: 2,
    solution: 'g(2) = 4, and f(4) = 2(4) + 3 = 11. Note that f(g(2)) is not the same as g(f(2)), which is 49.',
    verify: () => { const f = x => 2 * x + 3, g = x => x ** 2; return f(g(2)); },
  },
  {
    type: 'QA.ALG.MAXMIN', format: 'mcq', difficulty: 'moderate',
    stem: 'What is the maximum value of 6x − x² over all real x?',
    options: ['6', '9', '12', '18'],
    option_values: [6, 9, 12, 18],
    correct_option: 2,
    solution: '6x − x² = 9 − (x − 3)², which is largest when x = 3, giving 9.',
    // Scanned numerically rather than completing the square a second time.
    verify: () => {
      let best = -Infinity;
      for (let x = -20; x <= 20; x += 0.001) best = Math.max(best, 6 * x - x * x);
      return Math.round(best * 1000) / 1000;
    },
  },
  {
    type: 'QA.GEOM.CIRCLE', format: 'tita', difficulty: 'moderate',
    stem: 'A chord of length 16 cm lies at a perpendicular distance of 6 cm from the centre of a circle. What is the radius of the circle, in centimetres?',
    correct_answer: '10',
    solution: 'The perpendicular from the centre bisects the chord, giving a right triangle with legs 8 and 6, so the radius is √(64 + 36) = 10 cm.',
    verify: () => Math.sqrt((16 / 2) ** 2 + 6 ** 2),
  },
  {
    type: 'QA.GEOM.POLY', format: 'mcq', difficulty: 'easy',
    stem: 'What is the measure of each interior angle of a regular octagon, in degrees?',
    options: ['120', '135', '140', '144'],
    option_values: [120, 135, 140, 144],
    correct_option: 2,
    solution: 'Each interior angle of a regular n-sided polygon is (n − 2) × 180 / n. For n = 8 that is 6 × 180 / 8 = 135°.',
    // Derived from the exterior angle instead: 360/8 = 45, and 180 − 45 = 135.
    verify: () => 180 - 360 / 8,
  },
  {
    type: 'QA.GEOM.MENS', format: 'tita', difficulty: 'moderate',
    stem: 'A cone has radius 3 cm and height 7 cm. Taking π = 22/7, what is its volume in cubic centimetres?',
    correct_answer: '66',
    solution: 'Volume = ⅓πr²h = ⅓ × 22/7 × 9 × 7 = 66 cm³.',
    verify: () => (1 / 3) * (22 / 7) * 3 ** 2 * 7,
  },
  {
    type: 'QA.GEOM.COORD', format: 'tita', difficulty: 'easy',
    stem: 'What is the distance between the points (2, 3) and (7, 15)?',
    correct_answer: '13',
    solution: 'The distance is √((7−2)² + (15−3)²) = √(25 + 144) = √169 = 13.',
    verify: () => Math.hypot(7 - 2, 15 - 3),
  },
  {
    type: 'QA.GEOM.TRIG', format: 'mcq', difficulty: 'moderate',
    stem: 'If sin θ = 3/5 and θ is acute, what is tan θ?',
    options: ['3/4', '4/5', '4/3', '5/3'],
    option_values: [3 / 4, 4 / 5, 4 / 3, 5 / 3],
    correct_option: 1,
    solution: 'With sin θ = 3/5 and θ acute, cos θ = 4/5, so tan θ = (3/5) ÷ (4/5) = 3/4.',
    // Recovered through the actual angle rather than the 3-4-5 triangle.
    verify: () => { const t = Math.asin(3 / 5); return Math.round(Math.tan(t) * 1e9) / 1e9; },
  },
  {
    type: 'QA.MODERN.SET', format: 'tita', difficulty: 'easy',
    stem: 'In a class of 50 students, 30 play cricket, 25 play football, and 10 play both. How many students play neither game?',
    correct_answer: '5',
    solution: 'By inclusion–exclusion, 30 + 25 − 10 = 45 students play at least one game, leaving 5 who play neither.',
    verify: () => 50 - (30 + 25 - 10),
  },
  {
    type: 'QA.MODERN.BINOM', format: 'mcq', difficulty: 'moderate',
    stem: 'What is the coefficient of x² in the expansion of (1 + x)⁶?',
    options: ['6', '15', '20', '30'],
    option_values: [6, 15, 20, 30],
    correct_option: 2,
    solution: 'The coefficient is ⁶C₂ = 15.',
    // Built from Pascal's triangle rather than the factorial formula.
    verify: () => {
      let row = [1];
      for (let i = 0; i < 6; i += 1) {
        const next = [1];
        for (let j = 0; j < row.length - 1; j += 1) next.push(row[j] + row[j + 1]);
        next.push(1);
        row = next;
      }
      return row[2];
    },
  },

  // ─── Batch 3: the challenge tier (2026-08-04) ──────────────────────────────
  //
  // Everything above is easy-to-moderate. That is right for the coverage set — its
  // job is to find weak topics quickly, and a hard question tells you little about
  // whether someone knows a topic at all. But a student who only ever practises on
  // it would get a flattering and useless reading, because real CAT quant sits well
  // above this.
  //
  // These twelve are pitched at CAT level: multi-step, on the highest-yield topics
  // (arithmetic dominates real papers at roughly 40-50% of the section), and with
  // distractors that each encode a SPECIFIC mistake rather than being decoys. A
  // wrong option that corresponds to a real error makes the question diagnostic —
  // it tells you which way the student went wrong, not merely that they did.
  //
  // These deliberately REPEAT question types already covered above, which is why the
  // one-per-type assertion applies only to the first COVERAGE_COUNT items.

  {
    type: 'QA.ARITH.PLD', format: 'mcq', difficulty: 'hard',
    stem: 'A shopkeeper sells two articles for ₹1,200 each. On the first he makes a profit of 20%, and on the second he suffers a loss of 20%. Taking the two sales together, what is his overall result?',
    // Option A is the trap almost everyone reaches for: assuming +20% and −20%
    // cancel. They cannot, because the two cost prices differ.
    options: ['No profit, no loss', 'A loss of 2%', 'A loss of 4%', 'A profit of 4%'],
    option_values: [0, -2, -4, 4],
    correct_option: 3,
    solution:
      'The cost prices are 1200/1.2 = ₹1000 and 1200/0.8 = ₹1500, totalling ₹2500 against ₹2400 '
      + 'received — a loss of ₹100, or 4%. The percentages do not cancel because they apply to '
      + 'different cost prices.',
    verify: () => {
      const cp = 1200 / 1.2 + 1200 / 0.8, sp = 2400;
      return Math.round(((sp - cp) / cp) * 100 * 1e9) / 1e9;
    },
  },
  {
    type: 'QA.ARITH.TSD', format: 'tita', difficulty: 'hard',
    stem: 'Two trains, 180 m and 220 m long, travel on parallel tracks in opposite directions at 54 km/h and 90 km/h respectively. How many seconds do they take to cross each other completely?',
    correct_answer: '10',
    solution:
      'Moving in opposite directions the speeds add: 144 km/h = 40 m/s. Crossing completely means '
      + 'covering the sum of the lengths, 400 m, so the time is 400/40 = 10 seconds.',
    verify: () => (180 + 220) / ((54 + 90) * (5 / 18)),
  },
  {
    type: 'QA.ARITH.WORK', format: 'tita', difficulty: 'hard',
    stem: 'A can complete a job in 20 days and B can complete the same job in 30 days. They work on alternate days, with A working on the first day. In how many days is the job completed?',
    correct_answer: '24',
    solution:
      'Every two-day cycle completes 1/20 + 1/30 = 1/12 of the job, so 22 days finish 11/12. On day '
      + '23 A adds 1/20, reaching 58/60, and on day 24 B adds 1/30 to finish exactly. 24 days.',
    // Simulated day by day rather than reasoning about cycles a second time.
    verify: () => {
      let done = 0, day = 0;
      while (done < 1 - 1e-12) { day += 1; done += day % 2 === 1 ? 1 / 20 : 1 / 30; }
      return day;
    },
  },
  {
    type: 'QA.NUM.REM', format: 'tita', difficulty: 'hard',
    stem: 'What is the remainder when 7¹⁰³ is divided by 25?',
    correct_answer: '18',
    solution:
      '7² = 49 leaves remainder −1 on division by 25. So 7¹⁰² = (7²)⁵¹ leaves −1, and 7¹⁰³ leaves '
      + '−7, which is 18 modulo 25.',
    verify: () => Number((7n ** 103n) % 25n),
  },
  {
    type: 'QA.ALG.QUAD', format: 'mcq', difficulty: 'hard',
    stem: 'If α and β are the roots of x² − 6x + 7 = 0, what is the value of α⁴ + β⁴?',
    // 274 comes from forgetting to subtract 2(αβ)²; 484 from stopping at (α²+β²)².
    options: ['274', '386', '484', '542'],
    option_values: [274, 386, 484, 542],
    correct_option: 2,
    solution:
      'α + β = 6 and αβ = 7, so α² + β² = 36 − 14 = 22, and α⁴ + β⁴ = 22² − 2(7²) = 484 − 98 = 386.',
    // Computed from the actual irrational roots 3 ± √2, independent of the identity.
    verify: () => {
      const a = 3 + Math.SQRT2, b = 3 - Math.SQRT2;
      return Math.round((a ** 4 + b ** 4) * 1e6) / 1e6;
    },
  },
  {
    type: 'QA.ALG.INEQ', format: 'tita', difficulty: 'hard',
    stem: 'How many integer values of x satisfy | x − 2 | + | x + 3 | ≤ 9 ?',
    correct_answer: '10',
    solution:
      'The expression is the total distance from x to 2 and to −3. Between −3 and 2 it equals 5; it '
      + 'reaches 9 at x = −5 and x = 4. So −5 ≤ x ≤ 4, which is 10 integers.',
    verify: () => { let n = 0; for (let x = -100; x <= 100; x += 1) if (Math.abs(x - 2) + Math.abs(x + 3) <= 9) n += 1; return n; },
  },
  {
    type: 'QA.ALG.PROG', format: 'tita', difficulty: 'hard',
    stem: 'In an arithmetic progression, the sum of the first 10 terms is 175 and the sum of the next 10 terms is 475. What is the common difference?',
    correct_answer: '3',
    solution:
      'Each of the next ten terms exceeds its counterpart in the first ten by exactly 10d, so the '
      + 'difference between the sums is 100d = 300, giving d = 3.',
    // Solved by searching a and d against BOTH sums, so a value satisfying only one
    // cannot pass.
    verify: () => {
      const sum = (a, d, from, to) => { let s = 0; for (let i = from; i <= to; i += 1) s += a + (i - 1) * d; return s; };
      for (let d = -20; d <= 20; d += 1) {
        for (let a = -100; a <= 100; a += 0.5) {
          if (Math.abs(sum(a, d, 1, 10) - 175) < 1e-9 && Math.abs(sum(a, d, 11, 20) - 475) < 1e-9) return d;
        }
      }
      return NaN;
    },
  },
  {
    type: 'QA.MODERN.PNC', format: 'mcq', difficulty: 'hard',
    stem: 'In how many ways can 5 boys and 3 girls be seated in a row so that no two girls sit next to each other?',
    // 1440 = treating the girls as one block (the opposite condition);
    // 40320 = 8! with the restriction ignored entirely.
    options: ['1440', '4320', '14400', '40320'],
    option_values: [1440, 4320, 14400, 40320],
    correct_option: 3,
    solution:
      'Seat the 5 boys first in 5! = 120 ways. That creates 6 gaps, and the 3 girls occupy three '
      + 'different gaps in ⁶P₃ = 120 ways. Total 120 × 120 = 14400.',
    // Brute force over all 8! = 40320 seatings, counting those with no two girls
    // adjacent. Completely independent of the gaps argument.
    verify: () => {
      const people = ['B', 'B', 'B', 'B', 'B', 'G', 'G', 'G'].map((k, i) => k + i);
      let count = 0;
      const permute = (remaining, acc) => {
        if (remaining.length === 0) {
          for (let i = 0; i < acc.length - 1; i += 1) {
            if (acc[i][0] === 'G' && acc[i + 1][0] === 'G') return;
          }
          count += 1;
          return;
        }
        for (let i = 0; i < remaining.length; i += 1) {
          permute([...remaining.slice(0, i), ...remaining.slice(i + 1)], [...acc, remaining[i]]);
        }
      };
      permute(people, []);
      return count;
    },
  },
  {
    type: 'QA.MODERN.PROB', format: 'mcq', difficulty: 'hard',
    stem: 'Two fair six-sided dice are rolled. Given that the sum of the numbers is even, what is the probability that both numbers are odd?',
    // 1/4 is the unconditional probability of both being odd — the classic error of
    // ignoring the condition.
    options: ['1/4', '1/3', '1/2', '2/3'],
    option_values: [1 / 4, 1 / 3, 1 / 2, 2 / 3],
    correct_option: 3,
    solution:
      'The sum is even in 18 of the 36 outcomes: 9 with both odd and 9 with both even. So the '
      + 'conditional probability is 9/18 = 1/2.',
    verify: () => {
      let even = 0, bothOdd = 0;
      for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) {
        if ((a + b) % 2 === 0) { even += 1; if (a % 2 === 1 && b % 2 === 1) bothOdd += 1; }
      }
      return bothOdd / even;
    },
  },
  {
    type: 'QA.GEOM.TRI', format: 'tita', difficulty: 'hard',
    stem: 'A triangle has sides of length 13, 14 and 15. What is the length of the altitude drawn to the side of length 14?',
    correct_answer: '12',
    solution:
      'By Heron’s formula with s = 21, the area is √(21 × 8 × 7 × 6) = 84. Since the area is also '
      + '½ × 14 × h, the altitude is 168/14 = 12.',
    verify: () => {
      const a = 13, b = 14, c = 15, s = (a + b + c) / 2;
      const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
      return Math.round((2 * area / 14) * 1e9) / 1e9;
    },
  },
  {
    type: 'QA.GEOM.MENS', format: 'tita', difficulty: 'hard',
    stem: 'A solid metal sphere of radius 6 cm is melted down and recast into solid cones, each of radius 2 cm and height 3 cm. How many such cones are formed?',
    correct_answer: '72',
    solution:
      'The sphere’s volume is (4/3)π(6³) = 288π and each cone’s is (1/3)π(2²)(3) = 4π. Since π '
      + 'cancels, the answer is 288/4 = 72.',
    verify: () => ((4 / 3) * Math.PI * 6 ** 3) / ((1 / 3) * Math.PI * 2 ** 2 * 3),
  },
  {
    type: 'QA.ALG.LOG', format: 'tita', difficulty: 'hard',
    stem: 'Given that log₁₀ 2 = 0.3010, how many digits are there in 2⁶⁴?',
    correct_answer: '20',
    solution:
      '64 × 0.3010 = 19.264, so 2⁶⁴ lies between 10¹⁹ and 10²⁰ and therefore has 20 digits. The '
      + 'digit count is the integer part of the logarithm plus one, not the logarithm itself.',
    // Counted exactly with BigInt rather than trusting the logarithm.
    verify: () => (2n ** 64n).toString().length,
  },
];

// The first COVERAGE_COUNT items are the coverage tier: exactly one question per CAT
// QA question type. Everything after them is the challenge tier and may repeat types.
const COVERAGE_COUNT = 31;

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

  // The COVERAGE tier must hold exactly one question per taxonomy leaf. Not
  // cosmetic: a per-type reading is only meaningful if the coverage was chosen
  // rather than being an artefact of which topics happened to get written first,
  // and a duplicated type would silently double that type's weight.
  //
  // The challenge tier deliberately repeats types, so it is excluded here.
  const coverageTypes = ITEMS.slice(0, COVERAGE_COUNT).map(i => i.type);
  const dupes = coverageTypes.filter((t, i) => coverageTypes.indexOf(t) !== i);
  assert(dupes.length === 0,
    `coverage tier repeats question type(s): ${[...new Set(dupes)].join(', ')}`);
  console.log(`  ok  coverage tier: ${coverageTypes.length} types, none repeated`);

  const challenge = ITEMS.slice(COVERAGE_COUNT);
  assert(challenge.every(i => i.difficulty === 'hard'),
    'every challenge-tier question must be rated hard — that tier exists precisely to be hard, '
    + 'and a moderate question sitting in it would quietly flatter the student');
  console.log(`  ok  challenge tier: ${challenge.length} questions, all rated hard`);

  // Each paper must be non-empty and must not exceed the pool.
  for (const paper of PAPERS) {
    const picked = paper.take(ITEMS);
    assert(picked.length > 0, `${paper.code} selects no items`);
    assert(picked.length <= ITEMS.length, `${paper.code} selects more items than exist`);
    const perQuestionSec = (paper.time_limit_min * 60) / picked.length;
    // A sanity band around CAT's own ~109 s/question. Catches a paper whose time
    // was not updated after its question count changed — which would quietly train
    // the wrong pacing, the same failure as the old `?? 40` fallback.
    assert(perQuestionSec > 60 && perQuestionSec < 180,
      `${paper.code}: ${paper.time_limit_min} min over ${picked.length} questions is `
      + `${Math.round(perQuestionSec)} s/question, outside the sane 60-180 s band`);
    console.log(`  ok  ${paper.code}: ${picked.length} questions, ${paper.time_limit_min} min `
      + `(${Math.round(perQuestionSec)} s/question)`);
  }

  console.log(`all ${ITEMS.length} answer keys verified\n`);
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  verifyItems();

  const { data: exam, error: examError } = await db.from('exams')
    .select('id').eq('code', 'CAT').single();
  if (examError) throw examError;

  // Every paper here is single-section; the code is asserted identical so a future
  // multi-section paper fails loudly rather than being silently mis-seeded.
  const sectionCodes = [...new Set(PAPERS.map(p => p.section_code))];
  assert(sectionCodes.length === 1,
    `this script seeds one section at a time; found ${sectionCodes.join(', ')}`);

  const { data: section, error: sectionError } = await db.from('sections')
    .select('id, code').eq('exam_id', exam.id).eq('code', sectionCodes[0]).single();
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

  // Rebuild the item pool from scratch. Items have no natural key to upsert on, so a
  // re-run replaces rather than accumulates.
  //
  // KNOWN LIMITATION, worth fixing before real students accumulate history: because
  // this deletes and re-inserts, a re-run breaks the `question_attempts
  // .question_item_id` link on any PAST run. The grading survives intact — the
  // column is ON DELETE SET NULL and correctness/marks/timings live on the attempt
  // row — but "which question was this?" is lost. The fix is a stable
  // `question_items.code` unique per source, upserted on, which needs a migration.
  const { data: existingPapers } = await db.from('practice_papers')
    .select('id').eq('source_id', source.id);
  for (const p of existingPapers ?? []) {
    const { error } = await db.from('paper_items').delete().eq('paper_id', p.id);
    if (error) throw error;
  }
  const { error: dropError } = await db.from('question_items')
    .delete().eq('source_id', source.id);
  if (dropError) throw dropError;

  // Write the pool once, then assemble papers from it — so an item shared by two
  // papers is one row, not two copies that could drift apart.
  const itemIds = [];
  for (const item of ITEMS) {
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
    itemIds.push(written.id);
  }
  console.log(`items:  ${itemIds.length} written to the pool`);

  const seededPapers = [];
  for (const spec of PAPERS) {
    const { section_code, take, ...paperRow } = spec;
    const { data: paper, error: paperError } = await db.from('practice_papers')
      .upsert({ ...paperRow, source_id: source.id, exam_id: exam.id }, { onConflict: 'code' })
      .select().single();
    if (paperError) throw paperError;

    // `take` selects items by position, so the ids line up with ITEMS by index.
    const chosen = take(ITEMS.map((item, i) => ({ item, id: itemIds[i] })));
    let number = 0;
    for (const { id } of chosen) {
      number += 1;
      const { error: linkError } = await db.from('paper_items').insert({
        paper_id: paper.id,
        question_item_id: id,
        section_id: section.id,
        question_number: number,
      });
      if (linkError) throw linkError;
    }
    console.log(`paper:  ${paper.code} — ${number} questions, ${paper.time_limit_min} min`);
    seededPapers.push({ paper, count: number });
  }

  // ─── Read it back ──────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  const { count: itemCount, error: countError } = await db.from('question_items')
    .select('*', { count: 'exact', head: true }).eq('source_id', source.id);
  if (countError) throw countError;
  assert(itemCount === ITEMS.length, `db items: expected ${ITEMS.length}, found ${itemCount}`);
  console.log(`  ok  db items: ${itemCount}`);

  for (const { paper, count } of seededPapers) {
    const { data: linked, error: linkedError } = await db.from('paper_items')
      .select('question_number, question_items(response_format, correct_option, correct_answer, options)')
      .eq('paper_id', paper.id).order('question_number');
    if (linkedError) throw linkedError;

    assert(linked.length === count,
      `db ${paper.code}: expected ${count} items, found ${linked.length}`);

    // Numbering must be a gapless 1..n, or the runner would show "Question 13 of 14"
    // with no thirteenth question.
    const numbers = linked.map(r => r.question_number);
    const expected = Array.from({ length: count }, (_, i) => i + 1);
    assert(JSON.stringify(numbers) === JSON.stringify(expected),
      `db ${paper.code} numbering is not a gapless 1..${count}: got ${numbers.join(',')}`);

    // Every stored item must still be gradable — the check constraints should make
    // this impossible to violate, which is exactly why it is worth confirming.
    for (const row of linked) {
      const q = row.question_items;
      if (q.response_format === 'mcq') {
        assert(Array.isArray(q.options) && q.correct_option >= 1 && q.correct_option <= q.options.length,
          `db ${paper.code} Q${row.question_number}: mcq key out of range`);
        assert(q.correct_answer === null,
          `db ${paper.code} Q${row.question_number}: mcq carries a tita answer`);
      } else {
        assert(typeof q.correct_answer === 'string' && q.correct_answer.length > 0,
          `db ${paper.code} Q${row.question_number}: tita has no answer`);
        assert(q.options === null && q.correct_option === null,
          `db ${paper.code} Q${row.question_number}: tita carries mcq fields`);
      }
    }
    console.log(`  ok  db ${paper.code}: ${count} items, gapless, all gradable`);
  }

  const { data: src, error: srcError } = await db.from('content_sources')
    .select('kind, owner_user_id').eq('id', source.id).single();
  if (srcError) throw srcError;
  assert(src.kind === 'original',
    `db source kind is '${src.kind}' — this script may only write original content`);
  assert(src.owner_user_id === null, 'db source must not be tied to a user');
  console.log("  ok  db source kind = 'original'");

  console.log(
    `\nseeded: ${ITEMS.length} original QA questions `
    + `(${COVERAGE_COUNT} coverage, one per CAT QA type, plus `
    + `${ITEMS.length - COVERAGE_COUNT} hard) across ${seededPapers.length} papers:\n`
    + seededPapers.map(({ paper, count }) =>
        `  ${paper.title} — ${count} questions, ${paper.time_limit_min} min`).join('\n'),
  );
}

main().catch(err => { console.error(err); process.exit(1); });
