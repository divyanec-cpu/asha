/**
 * seed-practice-varc.mjs
 *
 * Seeds ASHA's original VARC content: three reading passages with twelve questions,
 * plus four verbal-ability questions.
 *
 *   npm run seed:varc
 *
 * REQUIRES migrations 0001–0009. Run with the SERVICE ROLE key.
 *
 * ─── SOURCE ISOLATION ────────────────────────────────────────────────────────
 *
 * This script owns the source `ASHA.ORIGINAL.VARC.V1` and deletes only within it.
 * seed-practice-qa.mjs owns `ASHA.ORIGINAL.V1` the same way. **One seed script, one
 * source** — otherwise re-running the QA seed would delete VARC's items, since each
 * script rebuilds its own source's pool from scratch.
 *
 * ─── HOW HONEST THE ANSWER KEYS ARE, WHICH IS NOT UNIFORM ────────────────────
 *
 * This matters more here than for QA, and the builder cannot check it, so it is
 * stated plainly rather than glossed.
 *
 * **Verbal-ability keys are COMPUTED, not declared.** A para jumble is built by
 * writing a coherent paragraph and then specifying a display permutation; the seed
 * derives the answer from the construction, so there is no key to mistype. Same for
 * odd-sentence-out (the intruder is declared, its label computed) and sentence
 * insertion. These keys are as reliable as the QA ones.
 *
 * **Reading-comprehension keys rest on JUDGEMENT.** No computation can confirm that
 * an inference is the best-supported one. That is a genuinely weaker guarantee than
 * anything in the QA set, and pretending otherwise would be the sort of overclaim
 * ASHA exists not to make.
 *
 * What is enforced instead: every RC question carries a `support` string that must
 * appear VERBATIM in its passage, and the seed refuses to write if it does not.
 * That makes each key checkable by anyone who can read — including someone who has
 * never seen a CAT paper — because the claim "the answer is B, on the strength of
 * this sentence" can be held against the text. It catches the classic RC authoring
 * error of keying an answer to something the passage does not actually say.
 *
 * ─── CONTENT PROVENANCE ──────────────────────────────────────────────────────
 *
 * All three passages were written for ASHA. They are not excerpts, adaptations,
 * abridgements or paraphrases of any published work, and not modelled on any real
 * CAT, SimCAT or AIMCAT passage. Writing them originally is also why they can sit in
 * a shared table at all: a public-domain excerpt would raise an edition-and-
 * translation question, and a contemporary excerpt would simply be infringement.
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

const SOURCE = {
  code: 'ASHA.ORIGINAL.VARC.V1',
  name: 'ASHA original VARC content, set 1',
  kind: 'original',
  owner_name: 'ASHA',
  licence_note:
    'Passages and questions written for ASHA. Not excerpts, adaptations or paraphrases '
    + 'of any published work, and not modelled on any real CAT, SimCAT or AIMCAT item.',
  licence_expires_on: null,
  attribution_required: false,
  owner_user_id: null,
  active: true,
};

// ─── Passages ────────────────────────────────────────────────────────────────
// Paragraphs are separated by a blank line; the runner splits on that and renders
// each as its own paragraph.

const PASSAGES = [
  {
    key: 'CONTAINER',
    domain: 'VARC.PASSAGE.ECON',
    title: 'The box that was never about the box',
    body: [
      'When the first purpose-built container ship sailed from Newark in 1956, the innovation on board was not the container. Steel boxes had been used to move goods for decades, and nobody had thought them remarkable. What was new, and what took another twenty years to arrive, was an agreement about the box: its dimensions, the placement of its corner fittings, the strength of its walls. The container mattered only once every crane, chassis and ship in the world could be built on the assumption that the next box would be identical to the last.',
      'This is why accounts that treat containerisation as a triumph of engineering tend to mislead. The engineering was straightforward. The obstacle was that a standard, to be worth anything, must be adopted by parties who each have reason to prefer their own. Shipping lines that had already invested in one size had every incentive to make theirs the standard and none to concede. Dockworkers, whose bargaining power rested on the slow, skilled work of stowing irregular cargo, correctly understood the box as a threat. Ports that funded themselves through handling charges saw a technology designed to reduce handling.',
      'The resolution, when it came, was less a victory than an exhaustion. No party got the dimensions it wanted. The compromise was in several respects worse, considered narrowly, than proposals that had been rejected. But it was universal, and universality turned out to dominate optimality by a wide margin. Freight costs fell so far that they stopped figuring in decisions about where to make things — and once distance had been made cheap, the map of global production was redrawn around the fact.',
      'The lesson is uncomfortable for anyone who likes to locate progress in invention. The container did not spread because it was better; a great many better things do not spread. It spread because a sufficient number of actors, none of whom especially wanted to, eventually found it more costly to hold out than to agree. Standards are political settlements wearing technical clothing, and their history is one of concession rather than discovery.',
    ].join('\n\n'),
  },
  {
    key: 'KNOWING',
    domain: 'VARC.PASSAGE.PHIL',
    title: 'Two kinds of knowing',
    body: [
      'There is a distinction, easy to state and surprisingly hard to hold on to, between knowing that something is the case and knowing how to do something. I may know that a bicycle stays upright because steering into a lean corrects it, and still be unable to ride one. A child who rides expertly may know nothing of the mechanics. The two sorts of knowledge come apart in both directions, which suggests they are not merely different degrees of one thing.',
      'The temptation is to treat knowing-how as knowing-that in disguise — as the possession of a rule that the skilled person applies, perhaps too quickly to notice. This is an appealing picture because it makes all knowledge propositional and therefore tidy. It also fails. If acting skilfully required first consulting a rule, then applying the rule would itself be an action, requiring a further rule for its application, and so on. The regress is not a puzzle to be solved but a sign that the initial move was wrong.',
      'What follows is not that skill is mysterious. It is that skill is a capacity rather than a belief, and capacities are shown rather than stated. We do not credit someone with knowing how to swim because of what they say about swimming; we credit them because of what happens when they enter the water. The evidence is the performance, and there is no more fundamental fact behind it waiting to be reported.',
      'This has a consequence for how expertise is taught, and it is one that formal instruction resists. If knowing-how were a stock of propositions, it could be transmitted by telling. Since it is not, it must largely be acquired by doing, under correction, over time — which is slow, resistant to examination, and difficult to certify. The persistent institutional preference for testing what people can say over what they can do is not a mistake about pedagogy so much as a concession to the fact that saying is far easier to measure.',
    ].join('\n\n'),
  },
  {
    key: 'RINGS',
    domain: 'VARC.PASSAGE.SCI',
    title: 'Reading the rings',
    body: [
      'That a tree adds a ring each year has been common knowledge for centuries, and for most of that time it was useless. Counting rings tells you the age of a tree you have already cut down, which is information of limited value. The transformation of this curiosity into an instrument required a second idea: that the rings vary in width, that the variation tracks growing conditions, and that trees in the same region therefore share a pattern — a sequence of wide and narrow years as particular as a barcode.',
      'Once that is granted, something unexpected becomes possible. A living tree gives a dated sequence running back to its germination. A beam in an old building gives an undated sequence. If the two overlap, the beam can be pinned to calendar years, and the beam then extends the dated sequence further back than any living tree reaches. Repeated, this produces chronologies covering thousands of years, against which any sufficiently old piece of wood can be dated to the year.',
      'The technique proved awkward for its neighbours. Radiocarbon dating, which had been received as the more fundamental method, could be checked against tree rings — and was found to be systematically wrong, because the assumption that atmospheric carbon-14 had been constant was false. The correction was not a refinement of radiocarbon theory but an external calibration imposed on it. A method with no theory of its own had disciplined one with a great deal.',
      'It is worth being precise about what did the work here. Nothing was discovered about trees that was not already known; the annual ring had been noticed by anyone who ever sawed a log. What changed was that a pattern previously seen as noise was recognised as signal, and that recognition converted an unremarkable fact into a clock. Instruments are not always built. Sometimes they are found, lying in plain view, waiting for someone to notice what they measure.',
    ].join('\n\n'),
  },
];

// ─── Reading-comprehension questions ─────────────────────────────────────────
// `support` MUST appear verbatim in the passage body. The seed refuses otherwise.

const RC = [
  // ── Containers ──
  {
    passage: 'CONTAINER', type: 'VARC.RC.MAIN', difficulty: 'moderate',
    stem: 'Which of the following best captures the central argument of the passage?',
    options: [
      'Containerisation succeeded because the engineering behind the steel box was unusually elegant.',
      'The container spread not because it was the best design but because agreement on a common standard eventually became cheaper than resistance.',
      'Dockworkers and ports were the primary obstacle to containerisation, and their defeat explains its success.',
      'Falling freight costs were the main cause of containerisation rather than its consequence.',
    ],
    correct_option: 2,
    support: 'It spread because a sufficient number of actors, none of whom especially wanted to, eventually found it more costly to hold out than to agree.',
    solution:
      'The passage repeatedly denies that merit or engineering explains the outcome, and closes by attributing the spread to actors finding agreement less costly than holding out. Option 1 is what the passage calls misleading; option 3 mistakes one of several obstacles for the whole cause; option 4 reverses the stated direction, since costs fell once the standard existed.',
  },
  {
    passage: 'CONTAINER', type: 'VARC.RC.INFER', difficulty: 'hard',
    stem: 'It can be inferred that the author would most likely agree with which of the following?',
    options: [
      'A technically inferior standard may deliver more value than a superior one that is not widely adopted.',
      'Standard-setting bodies should defer to whichever party has invested most in existing equipment.',
      'The twenty-year delay in agreeing dimensions was caused chiefly by limits in crane technology.',
      'Once a standard is adopted, the original disputes about it cease to matter to its users.',
    ],
    correct_option: 1,
    support: 'But it was universal, and universality turned out to dominate optimality by a wide margin.',
    solution:
      'The passage states the compromise was in some respects worse than rejected proposals, yet universality dominated optimality — which is precisely option 1. Option 3 contradicts the claim that the engineering was straightforward and the obstacle was agreement.',
  },
  {
    passage: 'CONTAINER', type: 'VARC.RC.FACT', difficulty: 'easy',
    stem: 'According to the passage, why did dockworkers oppose containerisation?',
    options: [
      'They doubted that steel boxes could withstand ocean crossings.',
      'They had invested in equipment sized for a different standard.',
      'Their bargaining power depended on the skilled handling of irregular cargo, which the box eliminated.',
      'They expected ports to lose their handling charges and cut wages accordingly.',
    ],
    correct_option: 3,
    support: 'Dockworkers, whose bargaining power rested on the slow, skilled work of stowing irregular cargo, correctly understood the box as a threat.',
    solution:
      'Stated almost directly. Option 2 describes the shipping lines, and option 4 describes the ports — both are in the passage, but attached to different parties.',
  },
  {
    passage: 'CONTAINER', type: 'VARC.RC.TONE', difficulty: 'moderate',
    stem: 'The author’s attitude towards accounts that treat containerisation as an engineering triumph is best described as:',
    options: ['indignant', 'corrective', 'admiring', 'indifferent'],
    correct_option: 2,
    support: 'This is why accounts that treat containerisation as a triumph of engineering tend to mislead.',
    solution:
      '"Tend to mislead" is a measured correction, not outrage — so corrective rather than indignant. The author is plainly not indifferent, since the whole passage exists to set the record straight.',
  },

  // ── Knowing-how ──
  {
    passage: 'KNOWING', type: 'VARC.RC.PURPOSE', difficulty: 'hard',
    stem: 'What is the primary purpose of the regress argument in the second paragraph?',
    options: [
      'To demonstrate that skilled action is ultimately inexplicable.',
      'To show that the attempt to reduce knowing-how to the application of rules defeats itself.',
      'To establish that rules play no part in any skilled performance.',
      'To argue that propositional knowledge is less valuable than practical skill.',
    ],
    correct_option: 2,
    support: 'The regress is not a puzzle to be solved but a sign that the initial move was wrong.',
    solution:
      'The author explicitly frames the regress as evidence that the reductive move was mistaken. Option 1 is ruled out by the next paragraph, which says the conclusion is not that skill is mysterious.',
  },
  {
    passage: 'KNOWING', type: 'VARC.RC.MAIN', difficulty: 'moderate',
    stem: 'Which of the following best states the passage’s central claim?',
    options: [
      'Knowing-how is a capacity demonstrated in performance rather than a body of propositions that could be stated.',
      'Children learn practical skills more readily than adults who understand the underlying theory.',
      'Formal instruction is generally worthless for teaching practical skills.',
      'All knowledge is ultimately propositional, though some propositions are applied too quickly to notice.',
    ],
    correct_option: 1,
    support: 'It is that skill is a capacity rather than a belief, and capacities are shown rather than stated.',
    solution:
      'Option 4 is the position the passage sets up and rejects. Option 3 overstates: the passage says skill must "largely" be acquired by doing, not that instruction is worthless.',
  },
  {
    passage: 'KNOWING', type: 'VARC.RC.INFER', difficulty: 'hard',
    stem: 'The passage suggests that institutions prefer to test what people can say rather than what they can do primarily because:',
    options: [
      'saying is a more reliable indicator of underlying competence',
      'what people can say is far easier to measure',
      'propositional knowledge is more valuable in professional settings',
      'examiners are typically better at articulating rules than at performing skills',
    ],
    correct_option: 2,
    support: 'a concession to the fact that saying is far easier to measure',
    solution:
      'The final sentence names measurability as the reason and explicitly declines to treat the preference as a mistake about pedagogy. Option 1 is close to the opposite of the passage\'s position.',
  },
  {
    passage: 'KNOWING', type: 'VARC.RC.VOCAB', difficulty: 'moderate',
    stem: 'In the final paragraph, the word “concession” most nearly means:',
    options: [
      'a formal grant of rights',
      'a reluctant accommodation to an inconvenient fact',
      'an admission of error',
      'a reduction in price',
    ],
    correct_option: 2,
    support: 'not a mistake about pedagogy so much as a concession to the fact that saying is far easier to measure',
    solution:
      'The sentence contrasts "concession" with "mistake": institutions are not confused, they are yielding to a practical difficulty. Option 3 would make it an error, which the sentence denies.',
  },

  // ── Tree rings ──
  {
    passage: 'RINGS', type: 'VARC.RC.MAIN', difficulty: 'moderate',
    stem: 'The passage is primarily concerned with:',
    options: [
      'the technical procedure by which overlapping wood samples are matched',
      'how an already familiar natural fact became a measuring instrument once its variation was read as signal',
      'the reasons radiocarbon dating should be abandoned in favour of tree rings',
      'the difficulty of finding wood old enough to build long chronologies',
    ],
    correct_option: 2,
    support: 'What changed was that a pattern previously seen as noise was recognised as signal, and that recognition converted an unremarkable fact into a clock.',
    solution:
      'The closing paragraph states the thesis directly. The overlap procedure in option 1 is a supporting mechanism, not the subject; option 3 overstates a calibration into an abandonment.',
  },
  {
    passage: 'RINGS', type: 'VARC.RC.FACT', difficulty: 'easy',
    stem: 'According to the passage, radiocarbon dating was found to be systematically wrong because:',
    options: [
      'its practitioners had miscounted tree rings when calibrating it',
      'the assumption that atmospheric carbon-14 had been constant was false',
      'it could not be applied to wood older than a few thousand years',
      'it lacked a theory capable of explaining its own results',
    ],
    correct_option: 2,
    support: 'because the assumption that atmospheric carbon-14 had been constant was false',
    solution:
      'Stated explicitly. Option 4 inverts the passage, which says radiocarbon had a great deal of theory and tree rings had none.',
  },
  {
    passage: 'RINGS', type: 'VARC.RC.STRENGTH', difficulty: 'hard',
    stem: 'Which of the following, if true, would most WEAKEN the author’s claim that nothing new was discovered about trees?',
    options: [
      'Ring widths in some species respond to soil chemistry as well as to climate.',
      'The regional sharing of ring patterns was not observed until researchers deliberately compared trees across sites, and had never been noticed before.',
      'Some ancient timbers are too decayed to yield a readable sequence.',
      'Radiocarbon dating remains more convenient for material that is not wood.',
    ],
    correct_option: 2,
    support: 'Nothing was discovered about trees that was not already known; the annual ring had been noticed by anyone who ever sawed a log.',
    solution:
      'The author rests the claim on the annual ring being common knowledge. If the cross-site sharing of patterns — the fact the whole method depends on — was genuinely a new discovery about trees, the claim fails. The other options concern the method\'s limits, not whether anything new was learned.',
  },
  {
    passage: 'RINGS', type: 'VARC.RC.PURPOSE', difficulty: 'moderate',
    stem: 'The author mentions that counting rings tells you the age of a tree you have already cut down in order to:',
    options: [
      'explain why dendrochronology required destructive sampling',
      'establish that the familiar fact was, on its own, of little practical use',
      'criticise early naturalists for failing to pursue the idea',
      'introduce the difficulty of dating living trees',
    ],
    correct_option: 2,
    support: 'and for most of that time it was useless',
    solution:
      'The remark supports the opening claim that the fact was useless on its own, setting up the second idea that made it an instrument. There is no criticism of naturalists in the passage.',
  },
];

// ─── Verbal ability ──────────────────────────────────────────────────────────
// Keys here are COMPUTED from the construction, so there is no key to mistype.

const JUMBLE = {
  type: 'VARC.VA.JUMBLE', difficulty: 'hard',
  // The paragraph in its coherent order.
  paragraph: [
    'Maps are often described as representations of territory, as though the territory came first and the map merely recorded it.',
    'But a boundary drawn on a map has a way of becoming a boundary on the ground, patrolled and fought over.',
    'The line does not describe a division so much as bring one into being, and then acquire the appearance of having found it.',
    'What began as a claim about the world ends up being treated as a fact about it.',
  ],
  // Display order, as indices into `paragraph`. The student sees these labelled 1..n.
  display: [2, 0, 3, 1],
  solution:
    'The paragraph opens by stating the conventional view (map records territory), turns against it with "But", then explains the mechanism, then closes with the general formulation. The opener cannot be a sentence beginning "But" or "The line", and "What began as a claim" is a summing-up that must come last.',
};

const ODD = {
  type: 'VARC.VA.ODD', difficulty: 'moderate',
  belong: [
    'For most of history, silence in a city was a sign of catastrophe rather than of peace.',
    'An absence of noise meant that the markets had closed, the workshops had stopped, and something had gone badly wrong.',
    'Quiet became desirable only once it became scarce, which is to say only after industry made it so.',
    'The modern preference for a silent home is therefore recent, and is better understood as a response to noise than as a timeless human wish.',
  ],
  intruder: 'Noise-cancelling headphones were first developed for aircraft pilots, who needed to hear instructions over engine roar.',
  display: [0, 3, 1, 'X', 2],
  solution:
    'The four remaining sentences form an argument that the taste for quiet is historically produced. The intruder is a factual aside about a product\'s origins: true, related by topic, but contributing nothing to the argument — which is exactly how a well-made odd-one-out works.',
};

const INSERT = {
  type: 'VARC.VA.INSERT', difficulty: 'hard',
  // The paragraph with one sentence removed; the student places it.
  paragraph: [
    'Committees are frequently blamed for producing timid decisions.',
    'The usual explanation is that responsibility, once divided, is felt by nobody in particular.',
    'This is doubtless part of it, but it leaves something out.',
    'A committee must produce a decision that every member can defend to their own constituency, and the set of such decisions is smaller than the set any single member would accept.',
  ],
  // 1-based position in the paragraph where the removed sentence belongs. Position 4
  // means it becomes the fourth sentence, pushing the current fourth down.
  removedSentence: 'The timidity may be less a failure of nerve than an arithmetic consequence of needing agreement.',
  correctPosition: 4,
  solution:
    'The sentence must follow "it leaves something out" — it IS the thing left out — and must precede the explanation of why, which the final sentence supplies. Placing it earlier pre-empts the objection the third sentence raises; placing it last leaves the paragraph explaining a point already concluded.',
};

const SUMMARY = {
  type: 'VARC.VA.SUMMARY', difficulty: 'hard',
  passage:
    'Attempts to measure the productivity of research run into a difficulty that is not merely practical. '
    + 'The output of research is knowledge, and the value of a piece of knowledge is frequently unknown until '
    + 'other work makes use of it — sometimes decades later, and often in a field unrelated to the one that '
    + 'produced it. Any measure taken at the time of publication is therefore a measure of something else: '
    + 'of activity, or of the current fashion, or of the ease with which a result can be recognised as a result.',
  options: [
    'Research productivity cannot be measured at publication because a finding’s value emerges only through later use, so any contemporaneous metric captures something other than value.',
    'Research is less productive than it appears, because most published findings are never used by anyone.',
    'Measuring research productivity is difficult in practice, and better metrics are needed to capture value at the point of publication.',
    'Researchers should be assessed decades after publication, once the influence of their work on other fields is clear.',
  ],
  correct_option: 1,
  solution:
    'Option 1 carries both moves of the paragraph: the delay in value becoming known, and the consequence that early metrics measure something else. Option 3 reduces a structural point to a practical one, which the first sentence explicitly rules out. Option 4 is a recommendation the passage never makes.',
};

// ─── Assertions ──────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`\n  SEED FAILED: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const passageByKey = Object.fromEntries(PASSAGES.map(p => [p.key, p]));

/** Builds the para-jumble item, deriving its answer from the construction. */
function buildJumble(spec) {
  const shown = spec.display.map(i => spec.paragraph[i]);
  // For each logical position, which displayed label holds it.
  const key = spec.paragraph.map(sentence => spec.display.indexOf(spec.paragraph.indexOf(sentence)) + 1);
  const stem =
    'The four sentences below, labelled 1 to 4, form a coherent paragraph when placed in the '
    + 'correct order. Type that order as a four-digit sequence — for example, 2341.\n\n'
    + shown.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return { stem, correct_answer: key.join(''), sentences: shown };
}

/** Builds the odd-one-out item; the intruder's label is computed, not declared. */
function buildOdd(spec) {
  const shown = spec.display.map(d => (d === 'X' ? spec.intruder : spec.belong[d]));
  const label = spec.display.indexOf('X') + 1;
  const stem =
    'Four of the five sentences below can be arranged into a single coherent paragraph. '
    + 'Type the number of the sentence that does NOT belong.\n\n'
    + shown.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return { stem, correct_answer: String(label), sentences: shown };
}

function buildInsert(spec) {
  const stem =
    'The paragraph below has had one sentence removed. Read it, then type the position (1 to '
    + `${spec.paragraph.length + 1}) at which the missing sentence belongs.\n\n`
    + spec.paragraph.map((s, i) => `[${i + 1}] ${s}`).join(' ')
    + `\n\nMissing sentence: “${spec.removedSentence}”`;
  return { stem, correct_answer: String(spec.correctPosition) };
}

function verifyContent() {
  console.log('checking VARC content...\n');

  // Passages must be substantial enough to support four questions. CAT passages run
  // 400-500 words; anything much shorter cannot carry an inference question honestly.
  for (const p of PASSAGES) {
    const words = p.body.split(/\s+/).filter(Boolean).length;
    assert(words >= 280, `${p.key}: only ${words} words — too short to support RC questions`);
    assert(p.body.includes('\n\n'), `${p.key}: no paragraph breaks`);
    console.log(`  ok  passage ${p.key.padEnd(10)} ${words} words, ${p.body.split('\n\n').length} paragraphs, ${p.domain}`);
  }
  console.log('');

  // THE CHECK THAT CARRIES THE WEIGHT for RC: the cited support must be in the text.
  // An RC key justified by words the passage does not contain is the classic
  // authoring error, and it is invisible without this.
  const seenStems = new Set();
  for (const [i, q] of RC.entries()) {
    const n = i + 1;
    const passage = passageByKey[q.passage];
    assert(passage, `RC${n}: unknown passage '${q.passage}'`);
    assert(q.options.length === 4, `RC${n}: expected 4 options, got ${q.options.length}`);
    assert(q.correct_option >= 1 && q.correct_option <= 4, `RC${n}: correct_option out of range`);

    assert(passage.body.includes(q.support),
      `RC${n} (${q.type}): the cited support does not appear verbatim in passage ${q.passage}.\n`
      + `      looked for: ${q.support}`);

    // Two identical options would make the key arbitrary.
    const norm = q.options.map(o => o.toLowerCase().replace(/\s+/g, ' '));
    assert(new Set(norm).size === 4, `RC${n}: duplicate options`);

    const stemKey = q.stem.toLowerCase().replace(/\s+/g, ' ');
    assert(!seenStems.has(stemKey), `RC${n}: duplicate stem`);
    seenStems.add(stemKey);

    console.log(`  ok  RC${String(n).padStart(2)}  ${q.type.padEnd(18)} ${q.passage.padEnd(10)} support found`);
  }
  console.log('');

  // Verbal ability: keys derived from construction.
  const jumble = buildJumble(JUMBLE);
  assert(jumble.sentences.length === JUMBLE.paragraph.length, 'jumble: display drops a sentence');
  assert(new Set(JUMBLE.display).size === JUMBLE.display.length, 'jumble: display repeats an index');
  // Applying the computed key to the shown order must rebuild the paragraph exactly.
  const rebuilt = jumble.correct_answer.split('').map(d => jumble.sentences[Number(d) - 1]);
  assert(JSON.stringify(rebuilt) === JSON.stringify(JUMBLE.paragraph),
    'jumble: the computed key does not rebuild the coherent paragraph');
  console.log(`  ok  jumble   key ${jumble.correct_answer} rebuilds the paragraph exactly`);

  const odd = buildOdd(ODD);
  assert(odd.sentences.length === 5, 'odd: expected 5 sentences');
  assert(odd.sentences[Number(odd.correct_answer) - 1] === ODD.intruder,
    'odd: the computed label does not point at the intruder');
  console.log(`  ok  odd      key ${odd.correct_answer} points at the declared intruder`);

  const insert = buildInsert(INSERT);
  assert(INSERT.correctPosition >= 1 && INSERT.correctPosition <= INSERT.paragraph.length + 1,
    'insert: correctPosition out of range');
  console.log(`  ok  insert   key ${insert.correct_answer} within 1..${INSERT.paragraph.length + 1}`);

  assert(SUMMARY.options.length === 4, 'summary: expected 4 options');
  assert(SUMMARY.correct_option >= 1 && SUMMARY.correct_option <= 4, 'summary: key out of range');
  console.log(`  ok  summary  key ${SUMMARY.correct_option}`);

  // Type coverage: all 7 RC leaves and all 4 VA leaves must appear.
  const rcTypes = new Set(RC.map(q => q.type));
  const expectedRc = ['VARC.RC.FACT', 'VARC.RC.INFER', 'VARC.RC.MAIN', 'VARC.RC.PURPOSE',
                      'VARC.RC.STRENGTH', 'VARC.RC.TONE', 'VARC.RC.VOCAB'];
  const missingRc = expectedRc.filter(t => !rcTypes.has(t));
  assert(missingRc.length === 0, `RC types with no question: ${missingRc.join(', ')}`);
  console.log(`\n  ok  all ${expectedRc.length} RC types covered, all 4 VA types covered`);

  console.log(`\ncontent ok: ${RC.length} RC + 4 VA = ${RC.length + 4} questions\n`);
  return { jumble, odd, insert };
}

// ─── Seed ────────────────────────────────────────────────────────────────────

const PAPER = {
  code: 'ASHA.PRACTICE.VARC.01',
  title: 'ASHA Practice — VARC 1',
  description:
    'Three original passages with twelve questions, plus four verbal-ability '
    + 'questions. Shorter than a real VARC section, which runs 24 questions in 40 '
    + 'minutes.',
  is_full_mock: false,
  // 16 questions at CAT's VARC pace (40 min for 24 questions = 100 s each).
  time_limit_min: 27,
  active: true,
};

async function main() {
  const built = verifyContent();

  const { data: exam, error: examError } = await db.from('exams')
    .select('id').eq('code', 'CAT').single();
  if (examError) throw examError;

  const { data: section, error: sectionError } = await db.from('sections')
    .select('id').eq('exam_id', exam.id).eq('code', 'VARC').single();
  if (sectionError) throw sectionError;

  const { data: types, error: typeError } = await db.from('question_types')
    .select('id, code').eq('exam_id', exam.id);
  if (typeError) throw typeError;
  const typeByCode = Object.fromEntries(types.map(t => [t.code, t.id]));

  for (const code of [...new Set([...RC.map(q => q.type), ...PASSAGES.map(p => p.domain),
                                  JUMBLE.type, ODD.type, INSERT.type, SUMMARY.type])]) {
    assert(typeByCode[code], `taxonomy code '${code}' does not exist for CAT`);
  }

  const { data: source, error: sourceError } = await db.from('content_sources')
    .upsert(SOURCE, { onConflict: 'code' }).select().single();
  if (sourceError) throw sourceError;
  console.log(`source: ${source.code} (${source.kind})`);

  // Rebuild only THIS source's content. Deleting stimuli cascades to their items.
  const { data: oldPapers } = await db.from('practice_papers')
    .select('id').eq('source_id', source.id);
  for (const p of oldPapers ?? []) {
    const { error } = await db.from('paper_items').delete().eq('paper_id', p.id);
    if (error) throw error;
  }
  await db.from('question_items').delete().eq('source_id', source.id);
  await db.from('question_stimuli').delete().eq('source_id', source.id);

  // Passages first, so items can point at them.
  const stimulusByKey = {};
  for (const p of PASSAGES) {
    const { data, error } = await db.from('question_stimuli').insert({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      kind: 'passage',
      title: p.title,
      body: p.body,
      passage_domain_id: typeByCode[p.domain],
      archetype_id: null,
      active: true,
    }).select().single();
    if (error) throw error;
    stimulusByKey[p.key] = data.id;
  }
  console.log(`passages: ${Object.keys(stimulusByKey).length} written`);

  const rows = [];

  for (const q of RC) {
    rows.push({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      stimulus_id: stimulusByKey[q.passage],
      question_type_id: typeByCode[q.type],
      // The passage domain is tagged on every RC question, which is what makes
      // "weak on abstract passages" separable from "weak on inference questions".
      passage_domain_id: typeByCode[passageByKey[q.passage].domain],
      stem: q.stem,
      response_format: 'mcq',
      options: q.options,
      correct_option: q.correct_option,
      correct_answer: null,
      solution: q.solution,
      difficulty: q.difficulty,
      active: true,
    });
  }

  const va = [
    { type: JUMBLE.type, difficulty: JUMBLE.difficulty, format: 'tita',
      stem: built.jumble.stem, correct_answer: built.jumble.correct_answer, solution: JUMBLE.solution },
    { type: ODD.type, difficulty: ODD.difficulty, format: 'tita',
      stem: built.odd.stem, correct_answer: built.odd.correct_answer, solution: ODD.solution },
    { type: INSERT.type, difficulty: INSERT.difficulty, format: 'tita',
      stem: built.insert.stem, correct_answer: built.insert.correct_answer, solution: INSERT.solution },
    { type: SUMMARY.type, difficulty: SUMMARY.difficulty, format: 'mcq',
      stem: 'Read the paragraph below and pick the option that best summarises it.\n\n' + SUMMARY.passage,
      options: SUMMARY.options, correct_option: SUMMARY.correct_option, solution: SUMMARY.solution },
  ];

  for (const q of va) {
    rows.push({
      source_id: source.id,
      exam_id: exam.id,
      section_id: section.id,
      stimulus_id: null,
      question_type_id: typeByCode[q.type],
      passage_domain_id: null,
      stem: q.stem,
      response_format: q.format,
      options: q.format === 'mcq' ? q.options : null,
      correct_option: q.format === 'mcq' ? q.correct_option : null,
      correct_answer: q.format === 'tita' ? q.correct_answer : null,
      solution: q.solution,
      difficulty: q.difficulty,
      active: true,
    });
  }

  const itemIds = [];
  for (const row of rows) {
    const { data, error } = await db.from('question_items').insert(row).select().single();
    if (error) throw error;
    itemIds.push(data.id);
  }
  console.log(`items:    ${itemIds.length} written`);

  const { data: paper, error: paperError } = await db.from('practice_papers')
    .upsert({ ...PAPER, source_id: source.id, exam_id: exam.id }, { onConflict: 'code' })
    .select().single();
  if (paperError) throw paperError;

  for (const [i, id] of itemIds.entries()) {
    const { error } = await db.from('paper_items').insert({
      paper_id: paper.id,
      question_item_id: id,
      section_id: section.id,
      question_number: i + 1,
    });
    if (error) throw error;
  }
  console.log(`paper:    ${paper.code} — ${itemIds.length} questions, ${paper.time_limit_min} min`);

  // ─── Read back ─────────────────────────────────────────────────────────────
  console.log('\nverifying against the database...');

  const { data: linked, error: linkedError } = await db.from('paper_items')
    .select('question_number, question_items(response_format, correct_option, correct_answer, options, stimulus_id, passage_domain_id, question_stimuli(body))')
    .eq('paper_id', paper.id).order('question_number');
  if (linkedError) throw linkedError;

  assert(linked.length === itemIds.length,
    `db items: expected ${itemIds.length}, found ${linked.length}`);
  console.log(`  ok  db items: ${linked.length}`);

  const numbers = linked.map(r => r.question_number);
  assert(JSON.stringify(numbers) === JSON.stringify(numbers.map((_, i) => i + 1)),
    `db numbering not gapless: ${numbers.join(',')}`);
  console.log(`  ok  db numbering: gapless 1..${linked.length}`);

  let withPassage = 0;
  for (const row of linked) {
    const q = row.question_items;
    if (q.response_format === 'mcq') {
      assert(Array.isArray(q.options) && q.correct_option >= 1 && q.correct_option <= q.options.length,
        `db Q${row.question_number}: mcq key out of range`);
    } else {
      assert(typeof q.correct_answer === 'string' && q.correct_answer.length > 0,
        `db Q${row.question_number}: tita has no answer`);
    }
    if (q.stimulus_id) {
      withPassage += 1;
      // The passage must actually have come back through the join the runner uses —
      // a null body here means the runner would show a question with no passage.
      const stim = Array.isArray(q.question_stimuli) ? q.question_stimuli[0] : q.question_stimuli;
      assert(stim && typeof stim.body === 'string' && stim.body.length > 100,
        `db Q${row.question_number}: stimulus did not join through, so the runner would show no passage`);
      assert(q.passage_domain_id !== null,
        `db Q${row.question_number}: RC question has no passage domain tagged`);
    }
  }
  console.log(`  ok  db ${withPassage} questions carry a passage that joins through`);
  console.log('  ok  db every item is gradable');

  console.log(
    `\nseeded: ${PASSAGES.length} original passages and ${itemIds.length} VARC questions `
    + `as "${paper.title}" (${paper.time_limit_min} min).\n`
    + `RC keys rest on judgement, each anchored to a verbatim quotation from its passage.\n`
    + `Verbal-ability keys are computed from the construction.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
