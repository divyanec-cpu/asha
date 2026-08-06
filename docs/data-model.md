# Data Model

Status: **live.** Migrations `0001`–`0005` applied 2026-07-29 and verified by `supabase/verify.sql`; the CAT taxonomy is seeded (75 nodes). **Twelve tables across five migrations** — `users`; the four shared reference tables; the five-deep attempt chain; `insights`; and `revision_queue` (live as of v2, 2026-08-01). Every table has Row Level Security; shared reference tables are read-only to authenticated users and written only by service-role seed scripts.

*(Corrected 2026-07-29: this line previously read "nine tables across four migrations". Counted from the migration files it is twelve across five — `0005` added none, but the original nine undercounted.)*

The structural difference from Dhruva: there is **no consent/invite graph**. Users are adults, so `users` has no `parent_id`, there is no `child_invites` table, and no DPDP minor-protection constraints apply. Standard adult export/delete obligations remain.

## Shared reference tables

*Same read model as Dhruva's `syllabus_topics`: readable by any authenticated user, written only via service role.*

- **`exams`** — id, code (`CAT`/`GMAT`/`MAT`, unique), name, adaptive (bool), active.

  **Correction (2026-07-29):** this previously said "GMAT and MAT rows exist so the schema is exercised but no UI exposes them." They do not exist — `seed-cat-taxonomy.mjs` inserts CAT only, which is what CLAUDE.md's scope fence requires ("GMAT and MAT configs — v3; the schema supports them, the seed data and UI do not ship"). The `code` check constraint permits them; no row does.

  Consequence, noticed while building the profile screen: the design's greyed-out **"GMAT — soon"** chip does not render, because `ProfileForm` derives its inactive-exam chips from rows in this table rather than hardcoding exam names. That is the correct behaviour — seeding a GMAT row with `active = false` would make the chip appear with no code change. It is recorded here so nobody "fixes" the missing chip by hardcoding a string.

  **Update (2026-08-03, v3):** the GMAT and MAT rows now exist, seeded by `scripts/seed-gmat-mat.mjs` with **`active = false`**, so the "GMAT — soon" chip renders as the design intended and no student can select either exam. `adaptive = true` for GMAT, `false` for MAT.
- **`exam_configs`** — id, exam_id, effective_year, total_questions, total_time_min, mark_correct, mark_wrong_mcq, mark_wrong_numeric, section_order_fixed, review_edit_limit (GMAT's 3-per-section; null elsewhere), unattempted_penalty (jsonb — XAT's −0.10-beyond-8 rule; null for CAT), notes. Unique on (exam_id, effective_year). **Versioned by year deliberately**: a mid-season pattern change is a data edit, never a code change.
- **`sections`** — id, exam_id, code, name, ordinal, time_limit_min, question_count, has_own_timer, counts_toward_score. Unique on (exam_id, code). `counts_toward_score = false` handles a section excluded from the composite — MAT's fifth section, XAT's GK — without a special case in scoring code.

  **Naming correction (2026-08-03):** `0002_taxonomy.sql` comments this column `-- false: MAT's IGE, XAT's GK`, and this line previously named "MAT's Indian & Global Environment". **That section was renamed "Economic & Business Environment"** in AIMA's MAT 2.0 revision; the old name no longer exists. The migration comment is left as applied history rather than rewritten.

  **`time_limit_min IS NULL` means the exam sets no sectional clock**, and `has_own_timer` must be `false` to match. MAT is the first such exam — 120 minutes across all five sections, moving freely. The two fields disagreeing is how a fabricated countdown reaches the screen, so `seed-gmat-mat.mjs` asserts they cannot; see the `sectionClock` note under *Derived measures*.
- **`question_types`** — id, exam_id, section_id, parent_id (self-referencing), code (unique per exam), name, **kind** (`question_type`/`set_archetype`/`passage_domain`), depth, is_leaf, description, sort_order, active. Unique on (exam_id, code).

  This is the configuration layer. Question types, DILR set archetypes and VARC passage domains all live in **one tree** so aggregation walks them identically. `kind` records the level at which a node is tagged, and which column carries it:

  | kind | tagged on | via |
  |---|---|---|
  | `question_type` | a question | `question_attempts.question_type_id` |
  | `set_archetype` | a DILR set | `set_attempts.archetype_id` |
  | `passage_domain` | a question's RC passage | `question_attempts.passage_domain_id` |

  Seeded by `scripts/seed-cat-taxonomy.mjs`: **75 CAT nodes** (VARC 21, DILR 18, QA 36) — **56 question types, 12 DILR set archetypes, 7 VARC passage domains**. Only `is_leaf` rows are selectable when logging, and a picker must filter on `kind` as well: without that, "Economics / business" would be offered as an RC *question type*. The seed script asserts all of these counts against the live database and exits non-zero on a mismatch.

  Seeded by `scripts/seed-gmat-mat.mjs` (2026-08-03): **33 GMAT nodes** (QR 13, VR 15, DI 5) and **57 MAT nodes** (LC 13, ICR 9, MS 21, DAS 8, EBE 6). **All 90 are `kind = 'question_type'`** — no set archetypes and no passage domains for either exam, asserted as zero so the choice cannot be reversed by accident. Reasoning in `decisions.md`, and the MAT half of it is a real deferral rather than a shrug: MAT's Data Analysis & Sufficiency genuinely does present 4–5 selectable DI sets, but archetypes would force the *whole* section to log by set and its standalone Data Sufficiency questions would have nowhere to go. That needs a mixed-mode section, which is a schema change.

## Per-user tables

*All owner-only RLS. Ownership on the attempt chain is inherited by join, not denormalised — a `user_id` column on `question_attempts` would be a second source of truth waiting to disagree with the first.*

- **`mock_sources`** — id, user_id, provider (`SimCAT`/`AIMCAT`/`iCAT`/`PYQ`/`Other`), title, is_official_pyq, created_at. Metadata only. **There is deliberately no `file_path` column in v1** — uploads are blocked pending an IP opinion (see CLAUDE.md), and the MVP needs no upload because attempt data is entered manually.
- **`mock_attempts`** — id, user_id, exam_id, exam_config_id, source_id (`on delete set null`), taken_on, logged_at, **timing_source** (`measured`/`estimated`/`absent`), **entry_mode** (`post_hoc_log`/`timed_in_app`), total_score, percentile_reported, notes, is_complete. Unique on (user_id, source_id, taken_on).

  `timing_source` is the honest-data rule made structural. v1 writes `estimated` for everything (the student recalls time in buckets during review); `measured` only becomes possible in v3's in-app timer. **No analysis may average across provenances without saying so.** `is_complete` exists because review entry is long enough that it must be resumable — an abandoned half-logged mock is the single likeliest churn event.
- **`section_attempts`** — id, mock_attempt_id, section_id, score, time_used_sec, num_attempted, num_correct, num_incorrect, num_skipped, **quarter_marks** (jsonb `[q1,q2,q3,q4]`), created_at. Unique on (mock_attempt_id, section_id). The quarter split is lifted directly from the GMAT Official Score Report's pacing view — it separates "ran out of time" from "collapsed in the final quarter", which are different problems with different fixes.
- **`set_attempts`** — id, section_attempt_id, archetype_id (→ `question_types` where kind = `set_archetype`), label, num_questions, variable_count (3-var vs 4-var matrix logic), **chosen**, selection_order, time_spent_sec, marks_earned, **solvable_verdict**, created_at.

  **The signature table.** A row exists for *every set on the paper*, including sets the student never touched — those carry `chosen = false`. This is what makes skip-regret computable, and it is the thing no competitor's data model supports. `time_spent_sec` includes time spent scanning a set and then abandoning it, because that time is spent whether or not marks follow. `solvable_verdict` (`cleared` / `attempted_failed` / `skipped_would_have_cleared` / `skipped_correctly` / `abandoned_midway`) is filled during review once the answers are known, and is the raw material of the set-selection playbook.
- **`question_attempts`** — id, section_attempt_id, set_attempt_id (nullable — null outside DILR), question_type_id, **passage_domain_id** (nullable, added in `0005`), question_number, response_format (`mcq`/`tita`), **order_index** (the order the *student* hit it, not paper order), time_spent_sec, status (`attempted`/`skipped`/`revisited`), is_correct (null when skipped), confidence (1–3, declared before checking), **error_cause** (`conceptual`/`misread`/`silly`/`time`/`none`), marks_earned, created_at.

  `response_format` matters more than it looks: CAT applies no negative marking to TITA, so "never leave a TITA blank" is a rule the app can check mechanically. `error_cause` is the four-way root-cause tag that makes recommendations actionable and is the clearest gap in every incumbent product.

  `passage_domain_id` (→ `question_types` where `kind = 'passage_domain'`) exists because the taxonomy seeds 7 passage-domain nodes and instructs the logger to tag domain **and** question type, which a single `question_type_id` cannot hold. Null everywhere outside VARC RC — every QA question, every DILR question and every verbal-ability question leaves it null, so it carries a **partial index** over the non-null rows only. Domain is frequently the real variable: an aspirant fine on business passages can collapse on abstract philosophy. See `decisions.md` for the rejected `passage_attempts` alternative.

  **Enforced by trigger, not by foreign key.** An FK can only say "some `question_types` row"; a CHECK constraint cannot run the subquery needed to say "a passage-domain leaf". `assert_passage_domain_valid()` fires before insert and before update of the column, and reads `kind` from the taxonomy rather than matching a hardcoded code prefix — so seeding another exam's domains needs no change to the trigger.

  **`order_index` and `time_spent_sec` caveats.** `order_index` is only populated where the entry flow actually knows it; neither v1 flow walks questions in student-attempt order, so treat it as reserved-in-practice until an entry step captures it. `time_spent_sec` in v1 always holds a **bucket midpoint** (<1m → 30, 1–2m → 90, 2–4m → 180, 4m+ → 300), never a measurement — `mock_attempts.timing_source = 'estimated'` is what makes that legible. The 4m+ bucket is unbounded, so 300 is a floor, not an estimate of the mean.
- **`insights`** — id, user_id, generated_at, kind (`set_selection`/`time_trap`/`quadrant`/`calibration`/`error_cause`/`pacing`/`skip_regret`), target_type_id, headline, rationale, **supporting_n** (not null, > 0), **confidence_label** (`low`/`medium`/`high`), acted_on, dismissed.

  `supporting_n` and `confidence_label` are `not null` **by design**: it is structurally impossible to store an insight without recording the evidence it rests on. `acted_on` is the primary value metric for the v1 → v2 gate.
- **`revision_queue`** *(RESERVED — defined, never written, no UI reads it)* — id, user_id, question_type_id, box (1–5 → 1-3-7-14-30 days), due_date. Shape settled now so the Leitner layer slots in without a migration, but it is v2 at the earliest per the scope fence.

## Evidence thresholds

Enforced in application code, documented here so the numbers are reviewable rather than buried:

| Insight kind | Minimum observations before it may be shown |
|---|---|
| `set_selection` | 5 sets of that archetype |
| `skip_regret` | 5 skipped sets across ≥3 mocks |
| `time_trap` | 5 attempts of that question type |
| `quadrant` | 8 attempts of that question type |
| `calibration` | 30 confidence-tagged answers |
| `error_cause` | 10 tagged errors in that section |
| `pacing` | 3 mocks |

Below threshold, the UI states what is missing ("3 more Games & Tournaments sets before this is reliable"), which is itself useful information. Confidence labels map to multiples of the threshold: `low` at 1×, `medium` at 2×, `high` at 3×.

**Calibration counts only explicitly confidence-tagged answers.** Because batch entry mode tags confidence on exceptions only, a student who always batches reaches n=30 more slowly. The locked card must say so. Never default an untagged answer to an assumed confidence to make the number move — that is fabrication under the honest-data rule.

## Derived measures

**Every number a screen displays must appear here with its formula and its own gate.** A plausible-sounding number with no traceable derivation is fabrication (CLAUDE.md, honest-data rule). Marking arithmetic reads `mark_correct` / `mark_wrong_mcq` / `mark_wrong_numeric` from `exam_configs` — never a hardcoded constant, even a currently-correct one.

Descriptive counts of what the student logged ("you attempted 4 DILR sets and cleared 1"; "your 9 QA errors split 5 conceptual, 3 misread, 1 silly") are **facts, not claims**, and are shown at any n with no gate. The distinction is the whole reason a 1-mock user still sees something.

| On-screen number | Formula | Gate |
|---|---|---|
| Score delta ("+14 vs your last three") | `score − mean(previous 3 total_score)` | ≥4 mocks; below that show "one reading is a point, not a direction" |
| Score spread ("the spread is ±11") | ±1 standard deviation of `total_score` across all logged mocks | ≥5 mocks |
| Trend band | the ±1 SD band only. **No trendline** — mock scores across different providers aren't a comparable series, and a slope would imply they are | ≥5 mocks |
| Clear rate (playbook) | `cleared / (chosen sets of that archetype)` | 5 sets of that archetype |
| Avg time to clear | median `time_spent_sec` over sets of that archetype with verdict `cleared` | 5 sets |
| Marks per minute | `sum(marks_earned) / (sum(time_spent_sec)/60)` over that archetype | 5 sets |
| Abandon threshold ("abandon at six minutes") | the student's own median time-to-clear for that archetype among **cleared** sets | ≥5 *cleared* sets; omit the sentence entirely below that |
| Latest-start threshold ("don't start one after the 35-minute mark") | `section time_limit_min − median time-to-clear for that archetype` | ≥5 cleared sets |
| Skip regret | count of `solvable_verdict = 'skipped_would_have_cleared'` over all `chosen = false` sets | 5 skipped sets across ≥3 mocks |
| Quadrant position | y = accuracy for that question type; x = mean of bucket midpoints for that type. Continuous despite 4 buckets, because a mean over many attempts is | 8 attempts of that type |
| Time trap | attempts in the top time bucket where that type's median sits ≥2 buckets lower. **Do not claim a ratio** ("2.4× your median") — 4 coarse buckets cannot support one | 5 attempts of that type |
| Calibration accuracy | `correct / tagged` per confidence level 1/2/3 | 30 tagged answers |
| Marks lost to guessing | `n_guesses × (p_correct × mark_correct + (1 − p_correct) × mark_wrong_mcq)`, where `p_correct` is measured accuracy at confidence 1. **Only emit when the loss clears a materiality floor** — under CAT's +3/−1 the breakeven accuracy is 25%, so guessing at 22% costs about 0.12 marks per guess and the honest finding is nearly neutral | 30 tagged answers **and** loss past the materiality floor |
| Pacing (marks by quarter) | `section_attempts.quarter_marks` as entered by the student from their mock platform's own analysis. **Not derivable** — neither v1 entry flow captures attempt order, so there is no honest way to infer it from time buckets | 3 mocks **with** quarter marks present |
| Global confidence chip ("12 MOCKS · HIGH CONFIDENCE") | no live insight → "no confident reading yet"; any live → `low`; majority of live kinds at ≥2× threshold → `medium`; at ≥3× → `high` | — |
| Practice grading (`lib/grading.ts`) | Per question: correct → `exam_configs.mark_correct`; wrong MCQ → `mark_wrong_mcq`; wrong TITA → `mark_wrong_numeric`; **unanswered → 0 and `is_correct = null`**, never "wrong", because grading a blank as wrong invents a penalty the real paper does not apply. TITA compares as a **number** when both sides parse as one (`0.5`, `.5`, `0.50`, `1,200` all match) but is **never rounded** — `0.333` and `0.334` stay different answers. Section total is the sum of per-question marks, rounded to 2dp so float addition cannot disagree with the stored value | — (deductive from the marking rules, not a claim about the student) |
| Working order (`lib/workingOrder.ts`) | The *n*th distinct question a student opens gets `order_index = n`. Revisiting does not renumber — first visit is what "the order worked in" means. Orders are gapless from 1 | — |
| Section clock during a timed run (`lib/sectionClock.ts`) | `time_limit_min` present → countdown `time_limit_min × 60 − elapsed`, auto-stop at zero, urgent inside 120s, bar = `elapsed / total`. `time_limit_min IS NULL` → **count up**, never expires, never urgent, bar = `current_question / question_count`. Not a claim about the student, so no threshold — but it is listed here because it is a number on screen, and until 2026-08-03 it was a fabricated one: the code read `(timeLimitMin ?? 40) * 60`, which would have imposed a 40-minute limit on MAT sections that have none | — |

## Reserved in practice

Defined and seeded, but nothing reads them in v1. Listed so no one wires a UI to an empty source:

- **`revision_queue`** — the Leitner layer, v2 at the earliest.
- ~~**`DILR.SKILL.*`** (4 taxonomy nodes)~~ — **no longer reserved as of 2026-08-05.** The original reason was sound: DILR is logged at set level, so no DILR question rows existed to carry a skill tag. **Practice DILR changed that.** Inside a practice run ASHA holds the questions and times each one, so it records per-question outcomes and working order — strictly more than the logging flow can obtain. All four skill leaves now carry questions.

  The archetype is still recorded for a practice set, on the `question_stimuli` exhibit (`kind = 'set_data'`, `archetype_id`) rather than on a `set_attempts` row, so the set-selection playbook's raw material survives.

  **Consequence for the attempt page:** it decides set-based vs question-based by whether a section owns `set_archetype` nodes, which is right for a logged mock and wrong for a practice run. A practice attempt is now always question-counted; without that, a finished DILR practice run reported `0 / 22 Q · BY SET`.
- **`mock_attempts.timing_source = 'measured'`** — impossible until the v3 in-app timer.
- **`question_attempts.order_index`** — see the caveat above.
- **`exams` rows for GMAT and MAT** — seeded 2026-08-03 with their configs, sections and taxonomies, but **`active = false`**, so the only UI that reads them is the profile form's "soon" chip list. Everything downstream of them — 8 sections, 90 taxonomy nodes, both marking configs — is unread until `active` is flipped.

  **Read before flipping GMAT's:** `exam_configs.mark_correct/mark_wrong_mcq/mark_wrong_numeric` are `not null`, but GMAT Focus is adaptive with IRT scoring (205–805) and has **no per-question marks**. They are seeded `1 / 0 / 0`, which makes `marks_earned` a **raw count of correct answers** — honest as a count, and *not* a GMAT score. Marks-per-minute reads as correct-answers-per-minute. The student's real score belongs in `mock_attempts.total_score`, reported, never computed. Activating GMAT means first auditing every screen that renders a marks figure for wording that would present that count as a score.

## Functions

- **`get_user_id_by_phone(text)`** *(security definer)* — matches an `auth.users` row by digits-only phone. Carried over unchanged from Dhruva, where it fixed a real bug: Supabase normalises stored phone numbers differently from raw input.

## Migration log

- **`0001_core.sql`** — `users` (adults only, no parent graph), owner-only RLS on all four operations, `get_user_id_by_phone`.
- **`0002_taxonomy.sql`** — `exams`, `exam_configs`, `sections`, `question_types`. Read-for-authenticated RLS, no write policies.
- **`0003_attempts.sql`** — `mock_sources`, `mock_attempts`, `section_attempts`, `set_attempts`, `question_attempts`. Owner-only RLS, inherited by join down the chain.
- **`0004_insights.sql`** — `insights` with not-null evidence columns; `revision_queue` reserved.
- **`0006_set_tally.sql`** *(2026-07-30)* — `num_attempted` and `num_correct` on `set_attempts`, both nullable (a set never opened has no tally), with `set_attempts_tally_bounds` enforcing `correct ≤ attempted ≤ num_questions`. Additive and reversible. Exists so marks stay recomputable from a corrected `exam_configs` row, and so "answered 4 of 4" is distinguishable from "answered 1 of 4".
- **`0005_passage_domain.sql`** *(2026-07-29)* — extends `question_types.kind` with `passage_domain` and reclassifies the 7 already-seeded VARC domain leaves; adds nullable `passage_domain_id` to `question_attempts` with a partial index; adds `assert_passage_domain_valid()` and its trigger. Additive and reversible — the rollback is written out at the foot of the migration file.

- **`0009_practice_content.sql`** *(2026-08-04)* — the practice-content layer. Five new tables plus three additive nullable columns and a widened `entry_mode`. Additive and reversible.
- **`0010_stimulus_charts.sql`** *(2026-08-05)* — `question_stimuli.chart_spec jsonb` and a third `kind`, `'chart'`, so a DILR chart exhibit can be a real graphic rather than a table wearing the label. A CHECK ties the two together: `kind = 'chart'` requires a spec with a `type` and a non-empty `series`, and any other kind requires the spec to be null — so neither a blank chart nor a passage carrying chart data can be inserted at all.

  **The spec is structured data, not SVG markup, and that is deliberate.** Stored markup rendered through `dangerouslySetInnerHTML` works today and becomes an injection vector the moment `content_sources.kind = 'private'` turns writable, because that is user-supplied HTML executing in another page. A spec rendered by `StimulusChart.tsx` cannot carry script, whoever wrote the row.

  Spec shape: `{ type: 'bar'|'line'|'scatter', xLabel?, yLabel?, yMax?, series: [{ name, points: [{x, y}] }] }`. Deliberately narrow — it is not a general charting language and should not become one. Additive and reversible.

  **Chart marks carry no printed values.** A chart question tests reading a graphic; labelling each bar with its figure turns it into arithmetic, which is the same objection that makes a table a dishonest substitute. Questions against a chart must therefore be robust to reading precision — comparisons, counts, or approximations whose options are far apart — and the seed keeps them so.

## Practice content (`0009`, 2026-08-04)

The tables that let ASHA put questions on screen. **Every one of them hangs off a source**, because a schema that can hold a question without recording who owns it is a schema that invites the mistake CLAUDE.md rule 2 exists to prevent.

- **`content_sources`** — id, code (unique), name, **kind** (`original` / `licensed` / `private`), owner_name, licence_note, licence_expires_on, attribution_required, owner_user_id, active. Two CHECKs do the real work: `licensed` cannot exist without a named owner (attribution would be impossible), and `owner_user_id` is present **exactly when** kind is `private`.

  | kind | means | writable today |
  |---|---|---|
  | `original` | written for ASHA; hand- or agent-drafted and hand-verified | yes |
  | `licensed` | a third party's, under agreement, attributed, with expiry | yes (none seeded) |
  | `private` | one student's own material, visible to nobody else | **no — reserved** |

  `private` is **read-policied but has no write path**. It is the case CLAUDE.md flags as needing an IP opinion. The read policies already exclude other users' private rows, so enabling it later means adding an insert policy — not rewriting the read path, which is the version of that change that leaks one student's material to another.

- **`question_stimuli`** — id, source_id, exam_id, section_id, kind (`passage` / `set_data`), title, body, passage_domain_id, archetype_id, active. One table for both, because an RC passage and a DILR set's data are the same shape to the delivery engine: a block of material several questions hang off.
- **`question_items`** — id, source_id, exam_id, section_id, stimulus_id, question_type_id, passage_domain_id, stem, response_format (`mcq`/`tita`), options (jsonb array), correct_option (**1-based**, to match how a paper labels them, so an off-by-one is visible rather than silent), correct_answer (text, compared as normalised value), solution, difficulty, active. Two CHECKs make an ungradable item impossible to insert: an `mcq` must have 2–6 options and a key inside that range and no TITA answer; a `tita` must have a non-blank answer and no MCQ fields. **No marks column** — marks come from `exam_configs` at grading time (rule 7).
- **`practice_papers`** — id, source_id, exam_id, code (unique), title, description, is_full_mock, **time_limit_min**, active (defaults false, opt in like exams). CHECK: only a full mock may leave `time_limit_min` null. A 14-question set handed CAT's full 40-minute QA clock would train precisely the wrong pacing.
- **`paper_items`** — id, paper_id, question_item_id, section_id, question_number. Unique on (paper_id, section_id, question_number) and on (paper_id, question_item_id), so numbers cannot collide and an item cannot appear twice.

**Added to existing tables**, all nullable so every prior attempt stays valid:

- `mock_attempts.paper_id` → `practice_papers`. Non-null means the attempt was taken **inside** ASHA.
- `mock_attempts.entry_mode` gains **`in_app_test`**. Distinct from `timed_in_app`, which means "ASHA ran the clock while the student worked their own paper, holding no questions" — only `in_app_test` has a machine-graded key behind it. The migration looks up the old constraint's auto-generated name rather than guessing it; guessing wrong would leave both constraints in place, with the old one silently rejecting the new value.
- `question_attempts.question_item_id`, `selected_option` (1-based, mcq), `response_text` (tita).

**RLS.** All five tables are select-only for authenticated, gated on the source being non-private or owned by the caller. **No insert/update/delete policies at all** — writes happen through service-role seed scripts, exactly as for the other shared reference tables.

**Query gotcha — `question_items` → `question_types` needs the FK named.** There are **two** foreign keys between them (`question_type_id` and `passage_domain_id`), so a bare embed fails with `PGRST201 Could not embed because more than one relationship was found`. Use the explicit form:

```
question_types!question_items_question_type_id_fkey(code, name)
```

Also, and separately: a select string passed to supabase-js must be **one string literal**. A concatenation (`"a, " + "b"`) widens to `string` at the type level and every field comes back typed as `GenericStringError`.

### Re-seeding breaks past runs' item links (known, unfixed)

`seed-practice-qa.mjs` deletes and re-inserts the item pool, because `question_items` has no natural key to upsert on. The grading of a past run survives — `question_item_id` is `ON DELETE SET NULL`, and correctness, marks and timings live on the attempt row — but *which question this was* is lost.

Harmless while the only history is test runs. The fix is a stable `question_items.code`, unique per source, upserted rather than deleted; it needs a small migration and should land before a real student accumulates history.

### Practice attempts are excluded from the cross-mock analytics

`lib/analytics/load.ts` filters out attempts with a non-null `paper_id`, and so do `/log` and the mock count. A 14-question practice set scores out of 42; a CAT mock out of 204. Blending them would put a 5 beside a 118 in the trend series and compute "+8.7 vs your last three" across both — a number with no meaning — and would inflate the mock count driving the global confidence chip.

**Open, and deliberately not defaulted:** whether practice *question-level* rows (measured timings, accuracy by type, confidence) should feed the per-type analytics. ASHA's own questions are not calibrated against a mock provider's, so this is a real trade-off and a builder decision. The rows are stored either way.

## Functions (continued)

- **`assert_passage_domain_valid()`** *(trigger function, `0005`)* — validates that a non-null `question_attempts.passage_domain_id` points at a `kind = 'passage_domain'` leaf. Not `security definer`; runs as the invoker, reading only the shared read-for-authenticated taxonomy.

## `revision_queue` — no longer reserved (2026-08-01)

Live as of v2. The table shape is unchanged from `0004`; no migration was needed,
which is the payoff for settling it early.

- One row per `(user_id, question_type_id)` — it schedules **topics, not
  questions**. Do not repurpose it for flashcards without reopening the content
  and copyright questions.
- `box` 1–5 maps to 1-3-7-14-30 days, defined once in
  `lib/analytics/revision.ts` as `BOX_INTERVAL_DAYS`. The list length is what pins
  the schema's `box between 1 and 5` check — do not extend one without the other.
- Rows are created only from the student's own `conceptual` error tags. Misreads,
  careless slips and time pressure are excluded: they are not knowledge gaps, and
  telling them apart is the whole reason `error_cause` is collected.
- **No evidence threshold applies.** A queue entry is a fact about what the
  student tagged, not a claim about their ability — the same reasoning that
  exempts `lib/analytics/facts.ts`.

### Derived measures added

| On-screen | Formula | Gate |
|---|---|---|
| Revision due date | `today + BOX_INTERVAL_DAYS[box - 1]` | — |
| Promotion ("revised it") | `box + 1`, capped at 5, rescheduled by the new interval | — |
| Demotion | a `conceptual` error in that type on a mock not yet applied → box 1, due tomorrow | — |
| Topics shown today | `due_date <= today`, most overdue first, capped at 5 | — |
| Deferred count | overdue topics beyond the cap, reported rather than truncated | — |

## Timing provenance moved to the section (`0008`, 2026-08-03)

`section_attempts.timing_source` (`measured` / `estimated` / `absent`, default
`estimated`), and `mock_attempts.timing_source` gains `mixed`.

**Why the attempt-level column was not enough.** In-app timed mode makes
`measured` real, and a student will realistically time one section and log the
others from recall — timing a 40-minute DILR section is a very different
commitment from timing all three. A single attempt-level column would have to
record a part-timed attempt as either `measured` or `estimated`, and both are
false. CLAUDE.md forbids averaging across provenances "without saying so", and a
column that cannot express the difference makes that unenforceable.

**The rollup is deliberately conservative** (`lib/analytics/provenance.ts`):
anything short of unanimity is `mixed`. Calling an attempt `measured` because most
of it was timed is exactly the silent averaging the rule prohibits — a reader
would take `measured` to mean all of it. `absent` sections are ignored rather than
counted as disagreement, since a section with no timing says nothing about the
provenance of the ones that have it.

`canAggregateTiming()` returns false for `mixed`, so a figure drawn half from a
stopwatch and half from memory is withheld rather than presented as one number.

### `order_index` is no longer reserved

No schema change — the column has existed since `0003`. It was documented as
"reserved in practice" because neither post-hoc entry flow could know the order a
student worked in. Timed mode observes it directly, so it is now populated for
timed sections and stays null for post-hoc ones, where paper order is all that is
knowable. It is never inferred.
