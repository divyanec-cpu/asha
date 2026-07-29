# Data Model

Status: **live.** Migrations `0001`–`0005` applied 2026-07-29 and verified by `supabase/verify.sql`; the CAT taxonomy is seeded (75 nodes). **Twelve tables across five migrations** — `users`; the four shared reference tables; the five-deep attempt chain; `insights`; and `revision_queue` (reserved). Every table has Row Level Security; shared reference tables are read-only to authenticated users and written only by service-role seed scripts.

*(Corrected 2026-07-29: this line previously read "nine tables across four migrations". Counted from the migration files it is twelve across five — `0005` added none, but the original nine undercounted.)*

The structural difference from Dhruva: there is **no consent/invite graph**. Users are adults, so `users` has no `parent_id`, there is no `child_invites` table, and no DPDP minor-protection constraints apply. Standard adult export/delete obligations remain.

## Shared reference tables

*Same read model as Dhruva's `syllabus_topics`: readable by any authenticated user, written only via service role.*

- **`exams`** — id, code (`CAT`/`GMAT`/`MAT`, unique), name, adaptive (bool), active. Only CAT has `active = true` in v1; GMAT and MAT rows exist so the schema is exercised but no UI exposes them.
- **`exam_configs`** — id, exam_id, effective_year, total_questions, total_time_min, mark_correct, mark_wrong_mcq, mark_wrong_numeric, section_order_fixed, review_edit_limit (GMAT's 3-per-section; null elsewhere), unattempted_penalty (jsonb — XAT's −0.10-beyond-8 rule; null for CAT), notes. Unique on (exam_id, effective_year). **Versioned by year deliberately**: a mid-season pattern change is a data edit, never a code change.
- **`sections`** — id, exam_id, code, name, ordinal, time_limit_min, question_count, has_own_timer, counts_toward_score. Unique on (exam_id, code). `counts_toward_score = false` handles MAT's Indian & Global Environment and XAT's GK without a special case in scoring code.
- **`question_types`** — id, exam_id, section_id, parent_id (self-referencing), code (unique per exam), name, **kind** (`question_type`/`set_archetype`/`passage_domain`), depth, is_leaf, description, sort_order, active. Unique on (exam_id, code).

  This is the configuration layer. Question types, DILR set archetypes and VARC passage domains all live in **one tree** so aggregation walks them identically. `kind` records the level at which a node is tagged, and which column carries it:

  | kind | tagged on | via |
  |---|---|---|
  | `question_type` | a question | `question_attempts.question_type_id` |
  | `set_archetype` | a DILR set | `set_attempts.archetype_id` |
  | `passage_domain` | a question's RC passage | `question_attempts.passage_domain_id` |

  Seeded by `scripts/seed-cat-taxonomy.mjs`: **75 CAT nodes** (VARC 21, DILR 18, QA 36) — **56 question types, 12 DILR set archetypes, 7 VARC passage domains**. Only `is_leaf` rows are selectable when logging, and a picker must filter on `kind` as well: without that, "Economics / business" would be offered as an RC *question type*. The seed script asserts all of these counts against the live database and exits non-zero on a mismatch.

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

## Reserved in practice

Defined and seeded, but nothing reads them in v1. Listed so no one wires a UI to an empty source:

- **`revision_queue`** — the Leitner layer, v2 at the earliest.
- **`DILR.SKILL.*`** (4 taxonomy nodes) — DILR is logged at set level in v1, so no DILR question rows exist to carry a skill tag. The quadrant therefore covers VARC and QA question types only, which matches the design.
- **`mock_attempts.timing_source = 'measured'`** — impossible until the v3 in-app timer.
- **`question_attempts.order_index`** — see the caveat above.
- **`exams` rows for GMAT and MAT** — present so the schema is exercised; no UI exposes them.

## Functions

- **`get_user_id_by_phone(text)`** *(security definer)* — matches an `auth.users` row by digits-only phone. Carried over unchanged from Dhruva, where it fixed a real bug: Supabase normalises stored phone numbers differently from raw input.

## Migration log

- **`0001_core.sql`** — `users` (adults only, no parent graph), owner-only RLS on all four operations, `get_user_id_by_phone`.
- **`0002_taxonomy.sql`** — `exams`, `exam_configs`, `sections`, `question_types`. Read-for-authenticated RLS, no write policies.
- **`0003_attempts.sql`** — `mock_sources`, `mock_attempts`, `section_attempts`, `set_attempts`, `question_attempts`. Owner-only RLS, inherited by join down the chain.
- **`0004_insights.sql`** — `insights` with not-null evidence columns; `revision_queue` reserved.
- **`0005_passage_domain.sql`** *(2026-07-29)* — extends `question_types.kind` with `passage_domain` and reclassifies the 7 already-seeded VARC domain leaves; adds nullable `passage_domain_id` to `question_attempts` with a partial index; adds `assert_passage_domain_valid()` and its trigger. Additive and reversible — the rollback is written out at the foot of the migration file.

## Functions (continued)

- **`assert_passage_domain_valid()`** *(trigger function, `0005`)* — validates that a non-null `question_attempts.passage_domain_id` points at a `kind = 'passage_domain'` leaf. Not `security definer`; runs as the invoker, reading only the shared read-for-authenticated taxonomy.
