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

// ─── Set 4: Games & tournaments ──────────────────────────────────────────────

const GAMES = {
  key: 'GAMES',
  archetype: 'DILR.ARCH.GAMES',
  title: 'Set 4 — a four-team round robin',
  body: [
    'Four teams — W, X, Y and Z — play a round robin in which every team plays every other team exactly once, so six matches are played in all.',
    'A team scores 3 points for a win, 1 point for a draw and nothing for a loss. At the end of the tournament the points stood as follows:',
    '  Team     Points\n  --------------\n  W             7\n  X             6\n  Y             1\n  Z             2',
    'No match was abandoned.',
  ].join('\n\n'),

  /**
   * Enumerates all 3^6 = 729 possible sets of results and keeps those producing the
   * stated points. Each match is 'H' (first team wins), 'A' (second wins) or 'D'.
   */
  solve(pointsFor = { W: 7, X: 6, Y: 1, Z: 2 }, winValue = 3) {
    const fixtures = [['W','X'], ['W','Y'], ['W','Z'], ['X','Y'], ['X','Z'], ['Y','Z']];
    const out = [];
    for (let mask = 0; mask < 3 ** 6; mask += 1) {
      const results = [];
      let m = mask;
      for (let i = 0; i < 6; i += 1) { results.push(['H','A','D'][m % 3]); m = Math.floor(m / 3); }
      const pts = { W: 0, X: 0, Y: 0, Z: 0 };
      fixtures.forEach(([a, b], i) => {
        if (results[i] === 'H') pts[a] += winValue;
        else if (results[i] === 'A') pts[b] += winValue;
        else { pts[a] += 1; pts[b] += 1; }
      });
      if (Object.keys(pointsFor).every(t => pts[t] === pointsFor[t])) {
        out.push({ results, fixtures, pts });
      }
    }
    return out;
  },

  /** Result of a named fixture, from the unique solution. */
  resultOf(a, b) {
    const s = this.solve()[0];
    const i = s.fixtures.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const r = s.results[i];
    if (r === 'D') return 'a draw';
    const winner = r === 'H' ? s.fixtures[i][0] : s.fixtures[i][1];
    return `${winner} won`;
  },
};

// ─── Set 5: Scheduling ───────────────────────────────────────────────────────

const SCHEDULE = {
  key: 'SCHEDULE',
  archetype: 'DILR.ARCH.SCHEDULE',
  title: 'Set 5 — five tasks, five days',
  body: [
    'Exactly one of five tasks — P, Q, R, S and T — is carried out on each working day of a single week, from Monday to Friday.',
    'It is known that:',
    '  (i)   P is carried out on the day immediately before Q.\n  (ii)  R is carried out on Wednesday.\n  (iii) S is carried out on some day before P.\n  (iv)  T is not carried out on Monday.',
  ].join('\n\n'),

  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

  solve(variant = {}) {
    const dropIV = variant.dropIV ?? false;
    return permutations(['P', 'Q', 'R', 'S', 'T']).filter((row) => {
      const at = (t) => row.indexOf(t);
      if (at('Q') !== at('P') + 1) return false;      // (i)
      if (at('R') !== 2) return false;                 // (ii) Wednesday is index 2
      if (at('S') >= at('P')) return false;            // (iii)
      if (!dropIV && at('T') === 0) return false;      // (iv)
      return true;
    });
  },
};

// ─── Set 6: Venn diagrams ────────────────────────────────────────────────────

const VENN = {
  key: 'VENN',
  archetype: 'DILR.ARCH.VENN',
  title: 'Set 6 — three languages',
  d: { total: 120, H: 70, E: 60, M: 45, HE: 30, EM: 20, HM: 25, HEM: 10 },
  get body() {
    const d = this.d;
    return [
      `A survey of ${d.total} students recorded which of three languages — Hindi, English and Marathi — each student can speak.`,
      'The findings were:',
      `  Speak Hindi                    ${String(d.H).padStart(4)}\n`
      + `  Speak English                  ${String(d.E).padStart(4)}\n`
      + `  Speak Marathi                  ${String(d.M).padStart(4)}\n`
      + `  Speak Hindi and English        ${String(d.HE).padStart(4)}\n`
      + `  Speak English and Marathi      ${String(d.EM).padStart(4)}\n`
      + `  Speak Hindi and Marathi        ${String(d.HM).padStart(4)}\n`
      + `  Speak all three                ${String(d.HEM).padStart(4)}`,
      'Each pairwise figure includes those who speak all three.',
    ].join('\n\n');
  },
  union() { const d = this.d; return d.H + d.E + d.M - d.HE - d.EM - d.HM + d.HEM; },
  none() { return this.d.total - this.union(); },
  exactlyOne() {
    const d = this.d;
    return (d.H - d.HE - d.HM + d.HEM) + (d.E - d.HE - d.EM + d.HEM) + (d.M - d.EM - d.HM + d.HEM);
  },
  exactlyTwo() {
    const d = this.d;
    return (d.HE - d.HEM) + (d.EM - d.HEM) + (d.HM - d.HEM);
  },
};

// ─── Set 7: Routes & networks ────────────────────────────────────────────────

const NETWORK = {
  key: 'NETWORK',
  archetype: 'DILR.ARCH.NETWORK',
  title: 'Set 7 — six towns',
  edges: [
    ['A','B',4], ['A','C',2], ['B','C',1], ['B','D',5],
    ['C','D',8], ['C','E',10], ['D','E',2], ['D','F',6], ['E','F',3],
  ],
  get body() {
    const rows = this.edges.map(([a, b, d]) => `  ${a} – ${b}${String(d).padStart(9)}`);
    return [
      'Six towns, A to F, are connected by the roads listed below. Each road can be travelled in either direction, and the distances are in kilometres.',
      ['  Road       Distance', '  -------------------', ...rows].join('\n'),
      'There are no other roads between these towns.',
    ].join('\n\n');
  },

  /** Dijkstra. `closed` omits a road, for the "what if" question. */
  shortest(from, to, closed = null) {
    const usable = this.edges.filter(([a, b]) =>
      !(closed && ((a === closed[0] && b === closed[1]) || (a === closed[1] && b === closed[0]))));
    const nodes = [...new Set(usable.flatMap(([a, b]) => [a, b]))];
    const dist = Object.fromEntries(nodes.map(n => [n, Infinity]));
    const prev = {};
    dist[from] = 0;
    const unvisited = new Set(nodes);
    while (unvisited.size) {
      let u = null;
      for (const n of unvisited) if (u === null || dist[n] < dist[u]) u = n;
      unvisited.delete(u);
      if (dist[u] === Infinity) break;
      for (const [a, b, w] of usable) {
        const v = a === u ? b : b === u ? a : null;
        if (v === null || !unvisited.has(v)) continue;
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    const path = [];
    for (let at = to; at !== undefined; at = prev[at]) { path.unshift(at); if (at === from) break; }
    return { distance: dist[to], path };
  },
};

// ─── Questions ───────────────────────────────────────────────────────────────
// `answer` is a FUNCTION of the solved set, never a declared constant.

const SETS = [ARRANGE, BINARY, CASELET, GAMES, SCHEDULE, VENN, NETWORK];

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

  // ── Set 4: Games ──
  {
    set: 'GAMES', skill: 'DILR.SKILL.DEDUCE', format: 'tita', difficulty: 'moderate',
    stem: 'How many of the six matches were drawn?',
    answer: () => GAMES.solve()[0].results.filter(r => r === 'D').length,
    solution:
      '7 can only be 3+3+1, so W won two and drew one. 6 can only be 3+3+0, so X won two and drew '
      + 'none. 1 must be 1+0+0 and 2 must be 1+1+0. Draw participations therefore total 1+0+1+2 = 4, '
      + 'which is two drawn matches.',
  },
  {
    set: 'GAMES', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'hard',
    stem: 'What was the result of the match between W and Z?',
    options: ['W won', 'Z won', 'a draw', 'It cannot be determined'],
    answer: () => GAMES.resultOf('W', 'Z'),
    solution:
      'Z drew two matches and X drew none, so Z’s draws were against W and Y. W drew exactly one '
      + 'match, which must therefore be the one against Z.',
  },
  {
    set: 'GAMES', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'moderate',
    stem: 'How many matches did X win?',
    answer: () => {
      const s = GAMES.solve()[0];
      return s.fixtures.filter(([a, b], i) =>
        (a === 'X' && s.results[i] === 'H') || (b === 'X' && s.results[i] === 'A')).length;
    },
    solution: 'X’s 6 points can only come from two wins and one loss, so X won two matches.',
  },
  {
    set: 'GAMES', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'hard',
    stem: 'Suppose a win had been worth 2 points instead of 3, with a draw still worth 1. How many points would W have finished with?',
    // Recomputed from the SAME results, rescored — not from a declared number.
    answer: () => {
      const s = GAMES.solve()[0];
      let pts = 0;
      s.fixtures.forEach(([a, b], i) => {
        if (a === 'W') pts += s.results[i] === 'H' ? 2 : s.results[i] === 'D' ? 1 : 0;
        else if (b === 'W') pts += s.results[i] === 'A' ? 2 : s.results[i] === 'D' ? 1 : 0;
      });
      return pts;
    },
    solution: 'W won two and drew one, so under 2-points-per-win that is 2 + 2 + 1 = 5 points.',
  },

  // ── Set 5: Scheduling ──
  {
    set: 'SCHEDULE', skill: 'DILR.SKILL.DEDUCE', format: 'mcq', difficulty: 'moderate',
    stem: 'Which task is carried out on Monday?',
    options: ['P', 'Q', 'S', 'T'],
    answer: () => SCHEDULE.solve()[0][0],
    solution:
      'R takes Wednesday, so the P–Q pair must occupy Monday–Tuesday or Thursday–Friday. Monday–'
      + 'Tuesday leaves no earlier day for S, so P and Q take Thursday and Friday. S and T then fill '
      + 'Monday and Tuesday, and since T cannot be Monday, S is on Monday.',
  },
  {
    set: 'SCHEDULE', skill: 'DILR.SKILL.READ', format: 'mcq', difficulty: 'easy',
    stem: 'On which day is T carried out?',
    options: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
    answer: () => SCHEDULE.days[SCHEDULE.solve()[0].indexOf('T')],
    solution: 'The schedule is S, T, R, P, Q from Monday to Friday, so T is on Tuesday.',
  },
  {
    set: 'SCHEDULE', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'easy',
    stem: 'How many tasks are carried out before R?',
    answer: () => SCHEDULE.solve()[0].indexOf('R'),
    solution: 'R is on Wednesday, the third day, so two tasks precede it.',
  },
  {
    set: 'SCHEDULE', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'hard',
    stem: 'Suppose condition (iv) were dropped, so that T could be carried out on any day. How many different schedules would then be possible?',
    // Counted by re-solving without (iv).
    answer: () => SCHEDULE.solve({ dropIV: true }).length,
    solution:
      'Conditions (i) to (iii) still force P and Q onto Thursday and Friday and R onto Wednesday, '
      + 'leaving S and T to fill Monday and Tuesday in either order. So two schedules — and (iv) is '
      + 'exactly what picks one of them out.',
  },

  // ── Set 6: Venn ──
  {
    set: 'VENN', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'moderate',
    stem: 'How many of the students surveyed speak none of the three languages?',
    answer: () => VENN.none(),
    solution:
      'By inclusion–exclusion, 70 + 60 + 45 − 30 − 20 − 25 + 10 = 110 speak at least one, so 10 of '
      + 'the 120 speak none.',
  },
  {
    set: 'VENN', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'hard',
    stem: 'How many students speak exactly one of the three languages?',
    answer: () => VENN.exactlyOne(),
    solution:
      'Hindi only is 70 − 30 − 25 + 10 = 25; English only is 60 − 30 − 20 + 10 = 20; Marathi only is '
      + '45 − 20 − 25 + 10 = 10. That totals 55. Adding back the pairwise overlap is what stops those '
      + 'who speak all three being subtracted twice.',
  },
  {
    set: 'VENN', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'moderate',
    stem: 'How many students speak exactly two of the three languages?',
    answer: () => VENN.exactlyTwo(),
    solution:
      'Each pairwise figure includes the ten who speak all three, so exactly two is '
      + '(30 − 10) + (20 − 10) + (25 − 10) = 45.',
  },
  {
    set: 'VENN', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'easy',
    stem: 'How many students speak Hindi but not English?',
    answer: () => VENN.d.H - VENN.d.HE,
    solution:
      '70 speak Hindi and 30 of them also speak English, so 40 speak Hindi without English. The '
      + 'all-three group needs no separate treatment here, since it is already inside the 30.',
  },

  // ── Set 7: Networks ──
  {
    set: 'NETWORK', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'hard',
    stem: 'What is the shortest distance, in kilometres, from A to F?',
    answer: () => NETWORK.shortest('A', 'F').distance,
    solution:
      'A–C–B is 3 km, shorter than A–B directly. From B, D is 8 km and then E is 10 km. F is reached '
      + 'in 14 km via D but 13 km via E, so the shortest route is A–C–B–D–E–F at 13 km.',
  },
  {
    set: 'NETWORK', skill: 'DILR.SKILL.CALC', format: 'tita', difficulty: 'moderate',
    stem: 'What is the shortest distance, in kilometres, from A to D?',
    answer: () => NETWORK.shortest('A', 'D').distance,
    solution:
      'A–C–B–D is 2 + 1 + 5 = 8 km, which beats A–B–D at 9 km and A–C–D at 10 km. The trap is '
      + 'assuming the direct A–B road must be part of the best route.',
  },
  {
    set: 'NETWORK', skill: 'DILR.SKILL.COUNT', format: 'tita', difficulty: 'moderate',
    stem: 'How many towns lie on the shortest route from A to F, counting A and F themselves?',
    answer: () => NETWORK.shortest('A', 'F').path.length,
    solution:
      'The shortest route is A–C–B–D–E–F, so six towns lie on it. Note that it passes through C '
      + 'even though A and B are directly connected, because going via C is 1 km shorter.',
  },
  {
    set: 'NETWORK', skill: 'DILR.SKILL.DEDUCE', format: 'tita', difficulty: 'hard',
    stem: 'Suppose the road between D and E were closed. What would the shortest distance from A to F then be, in kilometres?',
    // Recomputed with the edge removed.
    answer: () => NETWORK.shortest('A', 'F', ['D', 'E']).distance,
    solution:
      'Without D–E, E can only be reached from C at 12 km, making F 15 km that way, while F via D is '
      + '8 + 6 = 14 km. So the shortest becomes 14 km along A–C–B–D–F.',
  },
];

// ─── Assertions ──────────────────────────────────────────────────────────────

function fail(message) { console.error(`\n  SEED FAILED: ${message}\n`); process.exit(1); }
function assert(condition, message) { if (!condition) fail(message); }

const setByKey = Object.fromEntries(SETS.map(s => [s.key, s]));

function verifyContent() {
  console.log('solving every set from scratch...\n');

  // A set with more than one solution is worse than a wrong one: it looks fine and
  // marks a correctly-reasoning student wrong. Every set that HAS a solution space
  // gets this check.
  for (const key of ['ARRANGE', 'BINARY', 'GAMES', 'SCHEDULE']) {
    const solutions = setByKey[key].solve();
    assert(solutions.length === 1,
      `${key}: expected exactly 1 solution, found ${solutions.length} — an ambiguous set must not ship`);
    const shown = key === 'GAMES'
      ? JSON.stringify(solutions[0].results)
      : JSON.stringify(solutions[0]);
    console.log(`  ok  ${key.padEnd(9)} unique solution: ${shown}`);
  }

  // These two are arithmetic over declared data — nothing to be ambiguous about, but
  // their internal consistency is still worth confirming.
  console.log(`  ok  CASELET   totals ${CASELET.data.shops.map(s => `${s}=${CASELET.total(s)}`).join(' ')}`);

  // The Venn regions must partition the surveyed population exactly, or the figures
  // are mutually inconsistent and every answer derived from them is wrong.
  const parts = VENN.exactlyOne() + VENN.exactlyTwo() + VENN.d.HEM + VENN.none();
  assert(parts === VENN.d.total,
    `VENN: regions sum to ${parts} but the survey covered ${VENN.d.total} — the figures are inconsistent`);
  console.log(`  ok  VENN      regions partition all ${VENN.d.total}: `
    + `${VENN.exactlyOne()} one, ${VENN.exactlyTwo()} two, ${VENN.d.HEM} three, ${VENN.none()} none`);

  // Every town must be reachable, or a shortest-path question has no answer.
  const towns = [...new Set(NETWORK.edges.flatMap(([a, b]) => [a, b]))];
  for (const t of towns) {
    const d = NETWORK.shortest('A', t).distance;
    assert(Number.isFinite(d), `NETWORK: town ${t} is unreachable from A`);
  }
  console.log(`  ok  NETWORK   all ${towns.length} towns reachable; A→F = ${NETWORK.shortest('A','F').distance} km`);
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

/**
 * Papers are assembled from the set pool, so adding one is data rather than code.
 * `sets` names the keys, in the order they should appear.
 *
 * Times run at ~120 s/question, slightly above CAT's 109 s average, because a DILR
 * set has to be read and cracked before any of its questions can be answered.
 */
const PAPERS = [
  {
    code: 'ASHA.PRACTICE.DILR.01',
    title: 'ASHA Practice — DILR 1',
    description:
      'Three sets: an arrangement, a truth-teller puzzle and a data caselet. Shorter '
      + 'than a real DILR section, which runs 22 questions in 40 minutes across five sets.',
    is_full_mock: false,
    time_limit_min: 24,
    active: true,
    sets: ['ARRANGE', 'BINARY', 'CASELET'],
  },
  {
    code: 'ASHA.PRACTICE.DILR.02',
    title: 'ASHA Practice — DILR 2',
    description:
      'Four fresh sets: a round robin, a scheduling problem, a three-way Venn and a '
      + 'road network. Different set shapes from DILR 1, which is the point — set '
      + 'selection is a skill about recognising shapes.',
    is_full_mock: false,
    time_limit_min: 32,
    active: true,
    sets: ['GAMES', 'SCHEDULE', 'VENN', 'NETWORK'],
  },
];

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

  // Which item ids belong to which set, so a paper can pick whole sets.
  const idsBySet = {};
  QUESTIONS.forEach((q, i) => {
    (idsBySet[q.set] ??= []).push(itemIds[i]);
  });

  const seededPapers = [];
  for (const spec of PAPERS) {
    const { sets, ...paperRow } = spec;
    const { data: paper, error: pe } = await db.from('practice_papers')
      .upsert({ ...paperRow, source_id: source.id, exam_id: exam.id }, { onConflict: 'code' })
      .select().single();
    if (pe) throw pe;

    // Questions are numbered set by set, so a paper never interleaves two exhibits —
    // jumping between sets mid-paper is not how a real DILR section reads, and it
    // would also make the fold-state behaviour pointless.
    let number = 0;
    for (const key of sets) {
      for (const id of idsBySet[key]) {
        number += 1;
        const { error } = await db.from('paper_items').insert({
          paper_id: paper.id, question_item_id: id,
          section_id: section.id, question_number: number,
        });
        if (error) throw error;
      }
    }
    console.log(`paper:  ${paper.code} — ${number} questions, ${paper.time_limit_min} min`);
    seededPapers.push({ paper, count: number });
  }

  // ─── Read back ─────────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  for (const { paper, count } of seededPapers) {
    const { data: linked, error: le } = await db.from('paper_items')
      .select('question_number, question_items(response_format, correct_option, correct_answer, options, stimulus_id, question_stimuli(kind, body, archetype_id))')
      .eq('paper_id', paper.id).order('question_number');
    if (le) throw le;

    assert(linked.length === count,
      `db ${paper.code}: expected ${count} items, found ${linked.length}`);
    const numbers = linked.map(r => r.question_number);
    assert(JSON.stringify(numbers) === JSON.stringify(numbers.map((_, i) => i + 1)),
      `db ${paper.code} numbering not gapless: ${numbers.join(',')}`);

    // Consecutive questions from one set must stay together. If a paper interleaved
    // exhibits, the fold-state-per-passage behaviour would be useless and the paper
    // would read nothing like a real section.
    const order = linked.map(r => {
      const q = r.question_items;
      return Array.isArray(q.question_stimuli) ? q.question_stimuli[0] : q.question_stimuli;
    }).map(s => s.archetype_id);
    const distinct = [...new Set(order)];
    const grouped = distinct.length === order.filter((v, i) => order[i - 1] !== v).length;
    assert(grouped, `db ${paper.code}: questions from one set are not contiguous`);

    for (const row of linked) {
      const q = row.question_items;
      const stim = Array.isArray(q.question_stimuli) ? q.question_stimuli[0] : q.question_stimuli;
      assert(q.stimulus_id && stim, `db ${paper.code} Q${row.question_number}: no set attached`);
      assert(stim.kind === 'set_data',
        `db ${paper.code} Q${row.question_number}: stimulus kind is '${stim.kind}'`);
      assert(stim.archetype_id !== null,
        `db ${paper.code} Q${row.question_number}: set has no archetype tagged`);
      // Line breaks must survive the round trip, or the runner renders a table as one
      // unreadable run-on line.
      assert(stim.body.includes('\n'),
        `db ${paper.code} Q${row.question_number}: set data lost its line breaks`);
      if (q.response_format === 'mcq') {
        assert(q.correct_option >= 1 && q.correct_option <= q.options.length,
          `db ${paper.code} Q${row.question_number}: mcq key out of range`);
      } else {
        assert(typeof q.correct_answer === 'string' && q.correct_answer.length > 0,
          `db ${paper.code} Q${row.question_number}: tita has no answer`);
      }
    }
    console.log(`  ok  db ${paper.code}: ${count} items, ${distinct.length} sets, contiguous, all gradable`);
  }

  console.log(
    `\nseeded: ${SETS.length} original DILR sets and ${QUESTIONS.length} questions `
    + `across ${seededPapers.length} papers:\n`
    + seededPapers.map(({ paper, count }) =>
        `  ${paper.title} — ${count} questions, ${paper.time_limit_min} min`).join('\n')
    + `\nEvery key was computed by solving the set from scratch; all four logic sets\n`
    + `were asserted to have exactly one solution.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
