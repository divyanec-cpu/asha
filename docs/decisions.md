# Decisions

Append-only, newest first. Records *why* a non-obvious choice was made, so a future reader doesn't undo it by accident.

## 2026-08-04 — Three difficulty tiers, decided as the specialist

The builder said plainly that they do not know how CAT works and could not review the questions, and asked me to finalise. Recording the reasoning, since nobody else was in a position to check it.

**My own critique of the first batch was that it was too soft for CAT** — roughly a dozen of the 31 are trivial by real-paper standards, and a student clearing 90% learns nothing.

**The obvious fix was wrong.** Rewriting the easy questions as hard ones would have destroyed something valuable: an easy question is *better* at establishing whether someone knows a topic at all, because failure is unambiguous. A hard question conflates "doesn't know the topic" with "knows it but couldn't crack this one". Those are different diagnoses needing different questions.

So the tiers have distinct jobs, stated on the card so the student knows which they are taking:

| Paper | Job |
|---|---|
| QA 1 (14 q, 25 min) | Warm-up; learn the interface without wasting hard questions |
| QA Coverage (31 q, 56 min) | One question per CAT QA type. Find weak topics fast. Deliberately not all hard |
| QA Challenge (12 q, 30 min) | Real CAT difficulty on the highest-yield topics |

**Coverage is exactly one question per type — all 31.** That is what makes a per-type reading meaningful rather than an artefact of which topics got written first. Asserted in the seed, along with no repeats *within that tier*; the challenge tier repeats types on purpose.

**Challenge distractors encode specific mistakes, not decoys.** "No profit, no loss" for the two-articles question (assuming ±20% cancel, when the cost prices differ); 484 for α⁴+β⁴ (stopping before subtracting 2(αβ)²); 1/4 for the conditional probability (ignoring the condition). A wrong option matching a real error tells you *which way* the student went wrong — which is the whole point of an instrument rather than a score.

**Two new seed assertions**, both guarding against silent flattery: every challenge question must be rated `hard`, and each paper's seconds-per-question must fall within 60–180. The second catches a paper whose time was not updated after its question count changed — the same failure family as the `?? 40` fabrication: a number inherited from a context it no longer fits.

**Timing is per tier, not uniform.** CAT averages ~109 s/question; the challenge set gets 150 s, because harder questions legitimately take longer and holding them to the average would measure the clock rather than the maths.

**Still thin, and worth saying:** 43 questions is one section's worth of practice, and QA only. VARC and DILR have no content at all — and VARC additionally needs the runner to render a shared passage, which it currently cannot, since `question_stimuli` exists in the schema but the run page does not select or display it.

## 2026-08-04 — Practice content: the rule that changed, and the three that did not

The builder asked for mock tests in the app, initially for one person (their niece), with a longer-term plan to **license content from coaching centres**.

### The rule was narrowed, not deleted

Hard product rule 2 read *"ASHA is not a mock bank. It never ships a shared library of CAT/GMAT/MAT questions."* It now reads *"never an **unlicensed shared** bank"*, permitting `original`, `licensed` and `private` content with per-item provenance.

**What did not change:** no real exam item enters this codebase without a licence. Not for one user, not for testing, not "just to try it".

### "Aren't these available online?" — the question that decided the build order

They are, and it does not help:

- **The IIMs publish no CAT past papers at all.** What circulates as "CAT 2023 Slot 2" is a *reconstruction* assembled by a coaching institute from student recall. That reconstruction is IMS's or TIME's or Career Launcher's own copyrighted work — so copying it takes from precisely the people the plan is to partner with.
- **SimCAT and AIMCAT** are commercial products whose terms forbid reproduction outright.
- **Public readability is not a licence.** Copyright is automatic and needs no notice.

**The commercial argument turned out stronger than the legal one.** An institute doing due diligence on a licensing deal will ask what content ASHA already holds. If the answer is "yours, without a licence", that is not a partnership conversation. The clean position is an asset, and it is worth more than a shortcut to content. Hence: build the engine now with original content, and let licensed content slot in as a configuration change.

### `content_sources` exists so provenance cannot be forgotten

Every stimulus, item and paper carries a source; the source carries its licence terms. There is **no way to insert a question anonymously**, and a `licensed` row cannot exist without a named owner (a CHECK constraint, not a convention).

`private` — a student's own material — is defined and **read-policied but deliberately not writable**. CLAUDE.md still flags that case as needing an IP opinion. The read policies already exclude other users' private rows, so enabling it later adds an insert policy rather than rewriting the security model. Retrofitting that read path is the version of this change that leaks one student's material to another.

### The answer key never reaches the browser

The run page selects stems and options only — no `correct_option`, `correct_answer` or `solution` — and grading happens server-side in `/api/practice/[id]/submit`, which **ignores any verdict in the request** and derives it from the stored key and the stored marking rules. Verified by fetching the page's actual payload and searching for the key fields and three distinctive solution strings: all absent, with a question stem present as a control so the search was known to be looking at the right document.

### Answer keys are recomputed, not trusted

Each seeded question carries a `verify()` deriving its answer from first principles — exact modular exponentiation via BigInt, brute-force permutation, full enumeration of 36 dice outcomes — and the seed refuses to write if the declared key disagrees. It also refuses if a *second* option equals the correct answer.

Not ceremony. A wrong key is invisible, marks a correct student wrong, and then feeds that error into their error-cause tags and confidence calibration — so they would be told they had a concept gap on a question they got right. Three answers came back with floating-point drift (`4.999999999999982` for the 5% answer), which is why the check uses a tolerance rather than `===`.

### Practice runs are kept OUT of the cross-mock analytics

Found by testing rather than by design: `loadAnalyticsData` pulled every complete attempt, so a 14-question practice set scoring **5** landed in the same series as mocks scoring 118, and "+8.7 vs your last three" was about to be computed across both. It would also have inflated the mock count driving the global confidence chip — telling a student their readings were firmer because they did a short practice set.

Practice attempts are now excluded from the analytics loader, the mock log and the mock count, and listed on `/practice` instead so results stay reachable. The attempt page shows only the sections the paper covers, against the paper's own question count, and labels the score **"MARKED BY ASHA"** rather than "REPORTED" — the student did not report it.

**Left open deliberately:** whether to blend practice *question-level* data (measured timings, accuracy by type, confidence) into the per-type analytics. There is a real trade-off — ASHA's own questions are not calibrated against a mock provider's — and it is the builder's call, not a default chosen in a loader. All the data is stored either way.

### A partial paper declares its own clock

`practice_papers.time_limit_min`, with a CHECK that only a full mock may leave it null. Handing a 14-question set CAT's full 40-minute QA clock would train precisely the wrong pacing. Same family of error as the `?? 40` fabrication below: inheriting a number from a context it does not belong to.

## 2026-08-04 — The StrictMode order_index bug, written twice

`order_index` came out **2, 4, 6 … 28** instead of 1–14 on the first real practice run.

Identical to the bug fixed in `TimedRunner` on 2026-08-03, reintroduced in `PaperRunner` **directly beneath a comment warning about it**:

```js
setAnswers((prev) => {
  if (prev[i].orderIndex !== null) return prev;
  counter.current += 1;          // <-- mutation inside the updater
  return prev.map(...counter.current...);
});
```

React StrictMode double-invokes state updaters in development precisely to surface impure ones. On both invocations `prev` is the pre-update state, so the `!== null` guard passes twice and the counter advances twice.

A nasty class of bug: it misbehaves only in development, so it looks "fixed" in production while remaining timing-dependent there; and the damage is silent, because `order_index` feeds pacing analysis, where a doubled sequence is not obviously wrong, just wrong.

**Having written it twice, a comment is evidently not sufficient.** The decision now lives in `lib/workingOrder.ts` as a pure function with 6 tests, one of which simulates the double invocation directly. The caller mutates outside the updater. Verified live afterwards: visiting Q1 → Q5 → Q3 recorded orders 1, 2, 3, and revisiting Q1 did **not** renumber it.

## 2026-08-03 — GMAT and MAT: what was seeded, and the four things that are not what they look like

v3 scope item 2. Reference data only — no analytics changed, and no analytic
branches on exam code.

### 1. GMAT's marking numbers are not GMAT scoring, and the exam ships inactive because of it

`exam_configs.mark_correct / mark_wrong_mcq / mark_wrong_numeric` are `not null`.
The GMAT Focus Edition is **computer-adaptive and scored by item response
theory**: a question's contribution depends on its difficulty and on the whole
response pattern. Total 205–805, sections 60–90. **There is no per-question mark,
and no arithmetic over per-question marks can reproduce a GMAT score.**

The row cannot decline to answer, so it is seeded `1 / 0 / 0`. That encodes one
thing truthfully — GMAT applies no penalty for a wrong answer — and makes
`marks_earned` a **raw count of correct answers**. Honest as a count. Not a score.
Marks-per-minute for GMAT reads as "correct answers per minute".

This is the whole reason both exams are seeded `active = false`. The profile form
already separates active from inactive exams and renders the rest as "GMAT —
soon", so no student can select them. CLAUDE.md's v3 entry opens *"GMAT and MAT
configs. **Seed data only:** exam rows, `exam_configs` marking per pattern,
sections, and a taxonomy per exam."* Seed data, not UI — and activating GMAT
before auditing every screen for wording that would present a raw-correct count
as a score would ship exactly the overclaim rule 3 forbids.

Flipping `active` is a one-row update. The audit is the prerequisite, not the flip.

### 2. The MAT pattern in most published sources is out of date

CLAUDE.md: *"Each pattern must be independently verified before seeding, because a
wrong marking rule silently corrupts every figure for that exam."* This is what
that rule was for.

Several coaching sites still publish **200 questions, 40 per section, 150
minutes**, with a fifth section called **"Indian & Global Environment"**. AIMA's
own site gives **150 questions, 30 per section, 120 minutes**, with that section
renamed **"Economic & Business Environment"** (the "MAT 2.0" revision). The
official figures are seeded.

Had the widely-repeated figures been taken on trust, every MAT accuracy figure
would have carried a denominator 33% too large — and it would have looked
plausible, because 40 questions per section is what the internet says.

**Consequence for this repo:** `0002_taxonomy.sql` comments
`counts_toward_score` as `-- false: MAT's IGE, XAT's GK`, and `data-model.md`
described it as handling "MAT's Indian & Global Environment". That section no
longer exists under that name. The doc is corrected; the migration comment is
left alone, because migrations are applied history and rewriting one to look
prescient is worse than a stale comment.

### 3. MAT's fifth section: a conflict left visible rather than resolved

AIMA's page says all five sections count toward the MAT score. The coaching
consensus says Economic & Business Environment is scored but **excluded from the
percentile**, with some colleges still considering it at selection.

Seeded `counts_toward_score = false`, because the admissions-relevant number is
the percentile. Nothing in the codebase reads that column yet, so this is a
recorded position rather than live behaviour — and it is recorded in the seed
script's header as unresolved, not as settled fact.

### 4. Neither exam gets set archetypes — and MAT's case is a genuine loss

ASHA decides set-based vs question-based logging **per section**, by whether the
section owns `set_archetype` nodes. It is a section-level switch with no mixed
mode.

**GMAT Data Insights** contains Multi-Source Reasoning, which is set-shaped. But
DI also holds four standalone types, and the exam is adaptive — you cannot scan
the section and choose which sets to take. The DILR set-selection engine answers
*"which sets should I pick?"*, a question the GMAT does not permit.

**MAT Data Analysis & Sufficiency** is the harder call. It genuinely presents 4–5
DI sets, and MAT has **no sectional clock**, so set selection is a real skill
there — the signature feature would apply. Archetypes would nonetheless force the
*entire* section to log by set, leaving its 8–10 standalone Data Sufficiency
questions with nowhere to go. Question-level logging keeps everything loggable.

So this is a deliberate deferral, not an oversight: MAT set selection needs a
**mixed-mode section**, which is a schema change, and one that should be designed
against a real MAT user rather than guessed at now.

### Taxonomy granularity

GMAT 33 nodes, MAT 57 nodes, all `question_type` — no passage domains (a VARC-RC
construct), no archetypes. Kept coarse on purpose, for the same
threshold-reachability reason CLAUDE.md gives for archetypes: a taxonomy fine
enough to be satisfying is a taxonomy whose every leaf renders as a locked card
forever.

Content notes, verified rather than recalled: Focus Edition Quant is **Problem
Solving only** — Data Sufficiency moved to Data Insights — and **Geometry was
removed**, so no Geometry node exists under GMAT Quant. **Sentence Correction was
removed** from Verbal, so Verbal is Reading Comprehension and Critical Reasoning
only. Getting either wrong would have produced leaves nothing could ever be
tagged to, which reads as "you have no weakness here" rather than as an error.

## 2026-08-03 — `(timeLimitMin ?? 40)` was fabricating a time limit

Found while seeding MAT, which is the first exam ASHA has with **no sectional
clock**: MAT gives 120 minutes across all five sections and lets the student move
between them freely, so `sections.time_limit_min` is null for every MAT section.

`TimedRunner` computed `const totalSec = (timeLimitMin ?? 40) * 60`. Every CAT
section is 40 minutes, so the fallback never once showed itself. Against a section
with no clock it would have:

- displayed a 40-minute countdown the exam does not impose,
- **auto-stopped the run at 40 minutes**, truncating a measurement,
- and told the student *"The clock stops itself at 40 minutes, like the real
  one."* — which would have been false.

Two rules at once: rule 5 (never fabricate data — and this would have fabricated
it inside the one feature whose entire purpose is `timing_source = 'measured'`)
and rule 7 (no hardcoded exam constants; 40 belongs in `sections`).

**Fixed:** a section with a limit counts down and stops itself; a section without
one counts up and stops when the student stops it, the progress bar shows question
progress instead of a fraction of a nonexistent limit, and nothing is ever
"urgent" without a deadline to be urgent about.

The derivation moved to `lib/sectionClock.ts` as a pure function with 12 unit
tests. Not for tidiness: the no-limit branch is **unreachable through the UI while
MAT is inactive**, so a test is the only thing that can hold it correct until it
becomes reachable. The CAT path was re-verified live afterwards (40:00 → 39:58,
bar at 0.083%) to confirm the refactor changed nothing observable.

**The pattern worth remembering:** `?? <plausible default>` on a value that is
null *because the world is genuinely different there* silently invents a fact. The
null was carrying information, and the fallback discarded it. The seed script now
asserts that `time_limit_min IS NULL` and `has_own_timer = true` can never coexist
in a seeded section, so the two fields cannot drift back into disagreement.

## 2026-08-03 — The v2 → v3 gate was overridden too, two days later

The v1 → v2 override entry below ends with a prediction: that it "is not a
precedent for overriding that one". It took two days to be wrong.

**The gate:** *">40% of active users log ≥3 mocks and self-report that an insight
changed their set-selection behaviour."*

**The state:** 0 users with ≥3 mocks. 1 real mock in the database. No
self-reported behaviour change. This gate is a *percentage of active users*, and
there are no active users — so it was not merely unmet, it was **unmeasurable**.
There is no denominator.

**Both gates are now spent.** CLAUDE.md contains no remaining mechanism that can
refuse an expansion of scope. That is worth stating flatly because the gates were
the project's answer to a specific, named, three-times-repeated failure — its
opening decision entry says "'Don't scope-creep' is not an instruction anyone can
follow", which is precisely why the checks were written as numbers instead of
intentions. The numbers have now been set aside twice in three days, both times
after being shown.

**What is actually true about the current state**, recorded so it is not
reconstructed later from the commit log: the app is live and works, has one real
mock of data logged by the builder while testing, an unsigned APK because the
keystore does not yet exist, real-OTP login never exercised on a phone, and legal
review of the policy text outstanding. Four version tiers of features now sit on
top of that.

**Why the first item was still worth building.** Of the four remaining, in-app
timed test mode is the only one that adds capability without adding a dependency
— no AI, no content commissioning, no recurring cost — and it fixes the weakest
data in the product. Every timing figure today is the student's recollection
entered in buckets; the timer makes them measurements. `timing_source` and
`entry_mode` were both put in the schema on day one for exactly this, and the
analytics do not change at all, only the provenance label. That is the design
paying off as intended.

**The ordering was chosen on that basis** — capability-per-commitment, cheapest
first — rather than by version number.

## 2026-08-01 — The v1 → v2 gate was overridden while unmet

Recording this plainly, because the alternative — editing the gate to match
reality, or simply not mentioning it — is how a project loses the ability to tell
itself the truth.

**The gate:** *"v1 → v2 requires: a real user has logged ≥5 mocks and returned to
the set-selection view before their next mock. No gate, no next stage."*

**The state when it was overridden:** one real mock, logged by the builder while
testing the flow. Eight synthetic mocks from a fixture, which are not evidence of
anything except that the code runs. Four `acted_on` insights, all set by hand
while verifying carry-forward. On the metric the gate actually measures, the count
was zero.

**The decision was the builder's, made explicitly after being shown those
numbers.** They own the project and that is a legitimate call. What follows is the
honest accounting of what it costs, not a re-litigation.

**What is now unvalidated.** The gate existed to answer one question before more
was built: *is the set-selection playbook worth the ten minutes it costs to log a
mock?* Nobody knows. The builder raised exactly this doubt two days ago — "why
would a student use ASHA when they can't do anything meaningful from it" — and the
gate was the mechanism designed to answer it with evidence rather than opinion.
Building v2 first means the revision queue rests on the assumption that the
diagnosis underneath it is valuable. If that assumption is wrong, v2 makes the
product larger rather than better.

**Why this specific piece is nonetheless the low-risk choice.** Of the three
things v2 could have been, the revision queue is the only one that adds no new
dependency of any kind: the `revision_queue` table already exists with the right
shape, it needs no practice content (so no copyright exposure), and no AI (so no
runtime cost, no caps, no fallback path). It is also the piece that most directly
answers the builder's own critique, because it converts a diagnosis into something
to do. If v2 had to open, this was the cheapest door.

**What deliberately did not open.** OCR, micro-quizzes and AI all stay out, each
for its own reason and none of them softened. Overriding one gate is not
permission to treat the fence as advisory — and the **v2 → v3 gate still stands**.

**Still owed from v1**, and not cancelled by moving on: the `/account` footer
renders PRIVACY, TERMS and CONTACT as dead text with no routes behind them, on the
same screen as a working permanent-delete button. Real-OTP login has never been
exercised on a physical phone. There is no signing keystore. None of that got
easier by starting v2.

**The check to apply later:** if five real mocks eventually get logged and the
playbook turns out not to change anyone's set selection, this entry is the record
of the moment that became harder to find out.

## 2026-08-01 — Single-mock facts: findings that need no evidence threshold

**The problem this solves is the product's weakest point.** A student paid ten
minutes to log a mock and got back a restatement of what they had just typed in
("you attempted 4 DILR sets and cleared 1"), with everything genuinely useful
locked until mock three or five. The builder put it directly: *why would a student
use ASHA when they can't do anything meaningful from it?* That is a fair
description of the one-mock experience as it stood.

The fix is not to lower the thresholds. It is to notice that **not every finding
is a statistical claim.**

Everything in `setSelection.ts` / `questions.ts` / `trend.ts` generalises from a
sample to "how you tend to perform", so it genuinely needs enough observations to
be more than noise. But two other categories exist:

- **Deductive** — true by the marking rules rather than inferred from a sample.
  "A wrong TITA answer is not penalised, so leaving one blank was never the better
  choice" follows from `exam_configs`. One observation is enough, because nothing
  is being generalised.
- **Descriptive** — a count of what happened in one paper. `data-model.md` already
  permitted these at any n: *"Descriptive counts of what the student logged are
  always allowed at any n, because they are facts rather than claims."* The
  capability was already sanctioned; it just wasn't built.

`lib/analytics/facts.ts` emits four: blank TITA answers, a set walked past that
would have cleared, time spent on sets that returned nothing, and answers the
student felt certain about and got wrong. Ordered cheapest-fix-first, so blank
TITAs outrank everything.

**Where marks figures are deliberately absent.** Blank TITAs carry no marks
number — a blind numeric guess has a poor chance of landing, so quantifying the
"loss" would overclaim; the zero downside is the finding. Regretted skips carry no
marks number either, because "would have cleared" is the student's own post-hoc
judgement and "cleared" does not imply every question correct. Both cases could
easily have had a plausible number attached, and both would have been invention.

**The honesty constraint lives entirely in the wording**, which is why a test
enforces it. These findings bypass the thresholds, and that is only defensible
while every sentence describes *this paper*. A test asserts no fact contains
*always / never (except the deduction) / usually / tends to / every time / your
pattern / keep / habit / typically*. Without it, one future copy edit turns a
sanctioned fact into an unearned statistical claim, and nothing would fail.

Home now shows **FROM \<mock title\>** above **ACROSS ALL N MOCKS**, so the scope
of each group of statements is named rather than implied. At one mock this turned
a screen of locked cards into three specific actionable findings.

**Also: locked cards now link to `/help`.** Help was two taps deep behind an
unlabelled 30px avatar, and the bottom nav's four tabs are all data views with no
hint that an explanation exists. For a product whose argument is "you can check
our reasoning", that was the wrong place for it. The link sits on the locked card
because that is the exact moment the question arises, and design 2c already
treats "why is this locked?" as the main thing Help answers.

**What was rejected:** adding in-app test-taking. If students won't stick around,
that is the expensive wrong fix — it competes with SimCAT and AIMCAT on their own
ground, needs a question bank that cannot legally ship (rule 2), and makes ASHA a
worse version of something that already exists. Shortening time-to-first-insight
addresses the same concern without touching the scope fence.

## 2026-07-30 — Dev-mode OTP is refused in production builds, not just flag-gated

Found while preparing the first Vercel deployment, before any deployment existed.

Dev mode replaces the SMS with a six-digit code derived deterministically from
the phone number (`computeDevOtp`, salted `asha-dev-otp:`). The salt is in this
repository. So on any publicly reachable URL, dev mode means **anyone can compute
the OTP for any phone number and sign in as that person** — unauthenticated
account takeover for every user, with no exploit required beyond reading the
source.

The only thing standing in the way was `MSG91_DEV_MODE === "true"`. And
`.env.local.example` ships that flag set to `true`, because that is correct for
localhost — which makes "paste the env template into the hosting provider's
environment settings" both the most natural deployment step and a catastrophic,
silent one. Nothing would look broken; logins would simply work for everybody.

`lib/devMode.ts` now requires the flag **and** a non-production build. Vercel
sets `NODE_ENV=production` for production and preview deployments alike, so both
are closed. The client uses the same gate rather than reading `NEXT_PUBLIC_*`
directly, so the two sides cannot disagree — if the client took the dev path
while the server refused it, login would fail with "Missing access token", which
is a misconfiguration wearing the costume of a bug.

**Cost accepted:** OTP login cannot be exercised on a deployed preview URL;
preview testing needs real MSG91 credentials. That is the correct trade — a
public URL should never accept a guessable code.

Verified by building for production with **both** flags set to `true` and
confirming the dev-mode UI string and the OTP salt are absent from the client
bundle, with a positive control proving the search worked. A test pins the
production refusal, because the guard is one `if` and reads like a redundant
`NODE_ENV` check to anyone who does not know why it is there.

## 2026-07-29 — Fonts via Fontsource (npm), not `next/font/google`

`next/font/google` **downloads the .woff2 files from fonts.gstatic.com at build time.** That is easy to miss, because the phrase everyone repeats about it is "self-hosted" — which is true of the *served* app and false of the *build*. Any environment without egress to Google fails: an air-gapped CI, a restricted corporate network, or the sandbox this was developed in, where it produced an HTTP 500 on every page with `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` buried under a hundred font-fetch warnings.

`@fontsource-variable/instrument-sans` and `@fontsource/ibm-plex-mono` ship the identical font files as npm packages. So they are pinned in `package-lock.json`, fetched by the same install that fetches everything else, bundled by the build, and served from our own origin.

This is strictly better against what CLAUDE.md actually asked for — "self-host both, so the app never depends on Google Fonts at runtime" — because it removes the *build-time* dependency too. The rule's wording has been left alone; only the mechanism changed.

Family names are `"Instrument Sans Variable"` (a variable font covering 400–700 in one file) and `"IBM Plex Mono"` (three static weights: 400/500/600, the three the design uses). They are referenced from `globals.css`, so nothing changes if the mechanism changes again.

**Note for a future session:** the earlier `next build` passed *before* this was caught, because font-fetch failures are warnings at build time and only became fatal when a page actually rendered in dev. A green build is not evidence that fonts resolve.

## 2026-07-29 — Next pinned to 16.2.12, not Dhruva's 16.2.10

Found on the first `npm install`. **Next 16.2.10 — the version Dhruva pins — carries nine advisories**, all patched in 16.2.11:

- Middleware / proxy bypass in App Router applications
- Unauthenticated disclosure of internal Server Function endpoints
- SSRF in Server Actions on custom servers, and in rewrites via attacker-controlled destination hostname
- Cache confusion of response bodies for requests with bodies
- Denial of service in App Router via Server Actions, and in Image Optimization via SVGs
- Unbounded Server Action payload in the Edge runtime

**Correction (same day, while starting Phase 2):** the original version of this entry justified the bump mainly on the middleware bypass, claiming Phase 2 would use middleware session gating. That was wrong — Dhruva is deliberately middleware-less (`src/lib/supabase/server.ts` says so, and there is no `middleware.ts`), and ASHA follows it. The middleware advisory is therefore largely inapplicable to our shape.

The bump still stands on the remaining advisories, which do apply: **unauthenticated disclosure of internal Server Function endpoints**, SSRF in Server Actions on custom servers, cache confusion of response bodies, and unbounded Server Action payloads. Phase 2 introduces Route Handlers that mint credentials, so "unauthenticated disclosure of internal Server Function endpoints" is the one that matters most here. Left uncorrected, the original wording would have had a future reader defending a version pin on a threat model we don't have.

**Why this is not a stack-rule violation.** CLAUDE.md says match Dhruva's *major* versions so nothing is re-learned. 16.2.10 → 16.2.12 is a patch bump inside the same major.minor: no API changes, nothing to re-learn, and `next build` and `tsc --noEmit` both pass. The rule's purpose is served. CLAUDE.md now states explicitly that patch-level security bumps need no amendment, so a future session does not "restore consistency" by pinning back to a vulnerable build.

**Two transitive fixes applied as `overrides`:**

- `sharp` — libvips CVEs in `<0.35.0`. It is an *optional* dependency of Next, used only by Image Optimization, which v1 never touches (ASHA accepts no uploads at all). Overriding to `^0.35.3` caused npm to drop the package entirely, which removes the exposure outright and costs nothing we use.
- `postcss` — the tree held two copies: ours at 8.5.25 (clean) and **Next's own bundled 8.4.31**, which carries three advisories. The override collapses it to one clean copy. Practical risk was near zero — the advisories need attacker-controlled CSS and all our CSS is ours — but it was free to fix.

**Left unfixed, deliberately: nine advisories in the eslint chain** (`brace-expansion` / `minimatch` DoS via unbounded expansion). They are dev-only, never shipped, and exploiting them means running the linter against deliberately malicious glob patterns in your own repo. The only fix is an eslint 10 major bump, which `eslint-config-next` 16.2.12 does not support. Re-check when eslint-config-next supports eslint 10.

**A note that belongs with Dhruva, not here:** Dhruva is on `next` 16.2.10 with real families' data live, including minors'. The middleware bypass and the unauthenticated Server Function disclosure apply to it too. That is a separate project and outside this session's scope, but it should be looked at.

## 2026-07-29 — Renamed Sextant → ASHA

The docs were written as "Sextant"; the design handoff commits to "ASHA" throughout — splash wordmark, header, About screen, "VERSION 1.0 · CAT 2026". The design is the later artefact and the one a user will actually see, so it wins. The sextant metaphor survives as positioning ("an instrument, not a teacher"; "a sextant does not steer the ship") because the metaphor was always doing the work, not the word.

## 2026-07-29 — Web + Android + iOS in v1, via Capacitor in remote-URL mode

**This moves an item across the scope fence, which is exactly what the fence exists to prevent, so the reasoning has to hold up.**

The original fence deferred the mobile shell to v3 with a specific justification: *web-responsive only until the analytics loop demonstrably retains users*. That justification assumed the shell was **new work** — a second codebase, a second set of patterns, a second thing to learn and maintain. For Dhruva, it turned out not to be. Dhruva's `capacitor.config.ts` is nineteen lines: `appId`, `appName`, a placeholder `webDir`, and `server.url` pointing at the Vercel deployment. The Android app is a thin WebView over the same deployed site.

That changes the calculus completely:

- **The mobile app is not a second codebase.** It is a signed shell around the same URL. There is no second UI to build, no second auth flow, no separate release train for features.
- **Every push to `main` updates web, APK and IPA at once** — no reinstall, no store review for a feature change. The usual reason to defer mobile (a slow, gated release cycle diverging from web) does not apply.
- **The marginal cost is a build step and a keystore**, both of which the builder has already done once on Dhruva. "Nothing is re-learned" was the stated reason to copy Dhruva's stack; this is that reason paying out.
- **The target user is on a phone.** A working professional logging a mock in the evening is not reliably at a laptop, and the design was drawn at 390×844 for that reason. A home-screen icon is the difference between a habit and a bookmark, and time-to-logged-mock is the product metric.

Note that this reasoning applies to *packaging*, not to Android specifically — which is why iPhone gets the same benefit from an installed PWA and needs no native build. See the iOS entry above.

The deferral is therefore withdrawn on the grounds that its premise was wrong, not because the fence was inconvenient. **What is explicitly NOT withdrawn:** the in-app timed test mode stays v3, the flashcard layer stays v2, GMAT/MAT stay v3. Those are genuinely new surface area. This one was not.

**Cost accepted:** remote-URL mode means both apps require a network connection. For an analytics tool over server-held data that is close to free — there is nothing useful to do offline with no data.

## 2026-07-29 — iPhone is served by the PWA; no native iOS app in v1

*(This supersedes an earlier same-day draft that put a Capacitor `ios/` platform in v1 behind a separate ship gate. Folded into one entry rather than left as a contradicting pair, since nothing has been committed yet.)*

The realisation that settles it: **in remote-URL mode the Android app is already just a WebView over the deployed site.** So an iPhone user who opens the same URL in Safari and taps Add to Home Screen gets an icon, a fullscreen launch, and no browser chrome — which is not a degraded tier, it is the same application with a different installer. There is nothing the APK does that the installed PWA does not, because the APK isn't doing anything either; Vercel is.

That makes the native iOS build pure cost with no capability attached:

1. **An IPA requires Xcode on macOS**, and the builder is on Windows 11. It would mean Mac hardware or a cloud macOS runner.
2. **An Apple Developer Program membership**, annually, versus zero for the PWA.
3. **App Store Guideline 4.2 (minimum functionality) is a real rejection risk for exactly this architecture.** Apple rejects thin WebView wrappers around a website far more readily than Google does — Android sideloading does not care at all and Play is tolerant. A remote-URL Capacitor app is the textbook shape of a 4.2 rejection, and mitigating it (native icons and splash, graceful offline failure, some native capability the site lacks) is work Android never needed.

Paying all three to arrive at what Safari already does is the definition of scope creep, so it is out. **What is in:** the Apple-specific PWA work, which the manifest does not cover — `apple-mobile-web-app-capable` (without it Add to Home Screen yields a bookmark, not an app), the status-bar style set to the ink header colour, `apple-touch-icon` and startup images, and an install prompt for iOS Safari visitors.

**The install prompt is the part not to skip.** Add to Home Screen is a share-sheet action most people have never used. Without a nudge, iPhone users end up with a browser tab rather than an app, and time-to-logged-mock is the product metric — a tab is a bookmark, an icon is a habit.

**Known iOS PWA limits, honestly assessed:** web push needs the PWA home-screen installed (irrelevant in v1, no notifications — but it makes the install prompt load-bearing if a logging nudge ever ships); Safari evicts cached data for sites unused about a week (irrelevant, attempt data lives in Supabase); no offline use (already true of the APK).

**Revisit a native iOS app only against a concrete reason** — an App Store listing for discoverability, or a native capability the web cannot reach. Not because iOS "should" have an app.

## 2026-07-29 — Two question-entry modes, student picks per section

The design handoff offers two ways to log the same VARC/QA section: per-question cards with full tagging (screen 1e), and a batch grid where everything defaults to correct and you tap only the exceptions (1f). Both ship, selectable per section.

**Why not just the fast one.** Batch mode is clearly better for a section the student aced — 22 taps become 3 — and time-to-logged-mock is the stated product metric. But batch mode only captures confidence on the exceptions, and calibration's entire point is the *two* diagonals: confident-and-wrong and **unconfident-and-right**. The second one is invisible if you only tag the answers that went wrong, because an unconfident-but-correct answer looks identical to a confident-correct one in a batch grid. Shipping batch mode alone would quietly starve the calibration insight while appearing to work.

**Why not just the thorough one.** 22 questions × 4 taps is a long sitting, and it is the flow most exposed to the "if logging takes 30 minutes nobody does it twice" failure.

**Consequence, and it must be surfaced in the UI:** calibration's `n` counts only explicitly confidence-tagged answers. A student who always batches will see calibration stay locked for longer, and the locked card must say why — not silently default the untagged answers to some assumed confidence, which would be fabrication under rule 5.

## 2026-07-29 — Passage domain is a third taxonomy `kind`, and it fixes a latent picker bug

Written while implementing `0005`. The column needed a constraint saying "this must be one of the passage-domain leaves", and the first instinct was to match the code prefix `VARC.PASSAGE.%`. That would have hardcoded a taxonomy string into schema logic, which CLAUDE.md forbids for the same reason it forbids `if (exam === 'CAT')`: the taxonomy is data, and code that knows its literal contents stops being multi-exam the moment someone seeds a second exam's domains.

`kind` already existed to record **the level at which a node is tagged** — `question_type` on a question, `set_archetype` on a set. A passage domain is a third such level, tagged on a question's *passage*. So it becomes `kind = 'passage_domain'`, and the constraint reads the taxonomy instead of pattern-matching it.

**This also fixes a bug that had not surfaced yet.** The 7 domain leaves were seeded as `kind = 'question_type'`, so a question-type picker filtering the obvious way — `is_leaf AND kind = 'question_type'` — would have offered "Economics / business" and "Psychology" as *RC question types*, alongside "Inference" and "Main idea". Nothing would have errored; the student would just have been able to record a nonsense tag, and the resulting analytics would have looked fine. Caught here only because adding the third kind forced a count of what each kind contains.

**Why a trigger rather than a constraint.** A foreign key can only say "some `question_types` row". A CHECK constraint cannot run the subquery required to say "a `passage_domain` leaf". So `assert_passage_domain_valid()` fires before insert and before update of the column. It is the only trigger in the schema, and it is there because the alternative was trusting application code to be the sole guard on a foreign key that permits 74 wrong values out of 75.

## 2026-07-29 — Passage domain gets its own nullable column (migration 0005)

The seed script ships 7 `VARC.PASSAGE.*` nodes and its own description says to log the passage domain **and** the question type, because "domain is often the real variable — many aspirants are fine on business passages and collapse on abstract philosophy." But `question_attempts` has a single `question_type_id`, so both cannot be stored. As written, those 7 nodes were unreachable reference data and the instruction was impossible to follow.

Fixed with a nullable `passage_domain_id` on `question_attempts`, constrained to VARC passage-domain leaves. Additive, one column, and it makes already-seeded rows mean something.

**The rejected alternative worth recording:** a `passage_attempts` table between section and question, mirroring what `set_attempts` does for DILR. That is truer to how RC actually works — four questions hang off one passage, and the domain is a property of the passage, not of each question. It is the better model and it should be revisited if passage-level analytics (time per passage, first-passage-abandonment) are ever wanted. It was rejected for v1 only because it adds a table the docs don't anticipate for a gain the current insight set doesn't use.

## 2026-07-29 — Every marks figure comes from `exam_configs`

Found while reconciling the design handoff: the calibration screen (1i) claims that 41 guesses at 22% accuracy "handed back roughly 14 marks." Under CAT marking it doesn't. 41 guesses at 22% is 9 correct (+27) and 32 wrong (−32) — a **net loss of about 5 marks**, not 14. Worse for the copy, expected value per guess is `0.22×3 + 0.78×(−1) = −0.12`, and the breakeven accuracy is 25%: at 22% the student is barely losing anything, so "leave the guesses blank" is roughly EV-neutral advice presented as a finding.

That is precisely the overclaim rule 3 forbids, in the one screen whose subject is overclaiming. Two rules out of it, both now in CLAUDE.md:

1. **No hardcoded marks arithmetic.** Marking rules live in `exam_configs` — that is why the table is versioned by year — and a hand-written constant is a bug even when it currently agrees with the data.
2. **Every derived number on screen has a published formula**, in the *Derived measures* section of `docs/data-model.md`, gated by its own threshold. The design copy contains several numbers with no traceable derivation ("the spread is ±11", "abandon at six minutes", "don't start one after the 35-minute mark"). Each needs a real formula or it does not ship. Descriptive counts of what the student logged stay allowed at any n, because they are facts rather than claims.

## 2026-07-29 — Insight recompute must preserve `acted_on` and `dismissed`

Recomputation runs over the user's full history on every attempt completion, and `insights` is unique on `(user_id, kind, target_type_id, generated_at)` — so a recompute writes **new rows**. Left alone, that means a dismissed insight reappears after the next mock, and `acted_on` resets to false. `acted_on` is the primary metric for the v1 → v2 gate, so the gate would read as never met.

Recompute therefore carries both flags forward by matching `(kind, target_type_id)`. Recording it because the bug is silent: nothing errors, the insight just quietly comes back and the metric quietly reads zero.

## 2026-07-29 — The seed script asserts its own result against the database

`seed-cat-taxonomy.mjs` previously printed its counts. Printing is not checking: a partial seed, a stale row from an earlier taxonomy revision, or a duplicated code all produce cheerful output.

The duplicate-code case is the one that made this worth doing. The script upserts on `(exam_id, code)`, so two nodes sharing a code do not error — the second silently overwrites the first, and the taxonomy comes out one node short with no indication anywhere. That node then never appears in a picker, never accumulates attempts, and never shows up in the playbook. Nothing breaks; a capability just quietly does not exist.

So the script now: checks the literal for duplicate codes **before** touching the database; asserts node counts per section and per kind against a declared `EXPECT`; re-reads the live database after writing and asserts the same numbers there; cross-checks that the section `question_count` values sum to `exam_configs.total_questions` (68), so a typo in either shows up here instead of as a wrong denominator in accuracy figures months later; refuses a tagging `kind` on a grouping node, since only leaves are selectable and such a node would be unreachable; and exits non-zero on any failure.

All of these were verified to fire, not merely written — a deliberately duplicated code, a deleted node, and a `kind` moved onto a grouping node each fail the run and exit 1.

`EXPECT` is hand-maintained on purpose. Deriving the expected counts from the same literal being checked would make the assertion vacuous; the numbers have to come from a human counting them, which is what makes a mismatch meaningful.

## 2026-07-29 — Archetype granularity is capped by threshold reachability

The playbook mockup labels a row "Linear arrangement" where the taxonomy seeds a single "Arrangements" archetype. The tempting fix is to split it. Don't.

A student sees about 5 DILR sets per mock, so a 12-mock season is roughly 60 sets. Spread across the 12 seeded archetypes that averages exactly 5 — which is the set-selection threshold. The threshold is *only just* reachable at current granularity. Splitting Arrangements into linear / circular / matrix / multi-tier would put most archetypes permanently below 5, and the signature feature would render as locked cards forever for every user.

So the taxonomy stays at 12 archetypes and the UI uses the seeded names, even where a mockup shows a finer one. This is the case where the honest-data rule and the product's headline feature pull against each other, and the resolution is coarser buckets rather than a quieter threshold.

## 2026-07-29 — Day zero: schema and taxonomy before any code

**Why docs and migrations first, with no application code.** The stated failure across the previous three builds was scope creep and unclear data models settled too late — features built before the core flow was nailed, then reworked. Dhruva got this right and the earlier builds didn't, and the difference was the doc discipline (`CLAUDE.md` as a constitution, a data-model doc marking live-vs-reserved, an append-only decisions log). That discipline is being carried over wholesale and applied *before* the first line of application code, not after. The schema is the product here — this is an analytics tool, and an analytics tool with the wrong data model is unrecoverable.

**Why an explicit scope fence with numeric advance gates.** "Don't scope-creep" is not an instruction anyone can follow. A written list of things that are explicitly *not* being built, plus a measurable gate before the next stage opens (≥5 mocks logged by a real user; >40% of active users logging ≥3), turns a good intention into a check that can fail. The deferred list deliberately includes things that look easy and tempting — flashcards, AI chat, GMAT support — because those are exactly what pulled the previous builds off course.

## 2026-07-29 — Set archetypes and question types share one taxonomy tree

**Why not two tables.** A DILR set archetype ("Games & Tournaments") and a question type ("Remainders") are tagged at different levels — one on a set, one on a question — which argues for separate tables. They're in one self-referencing tree instead, distinguished by a `kind` column, because every analytic that matters (accuracy rollup, time rollup, marks-per-minute, trend over mocks) is *identical* for both. Two tables would mean two copies of that aggregation code, which would drift. One tree means the set-selection engine and the question-type engine are the same code reading different `kind` values.

**Why the taxonomy is seed data rather than a TypeScript enum.** Adding GMAT or MAT must be a seeding job, not a code change. The moment there is an `if (exam === 'CAT')` branch in analytics code, the multi-exam claim is false. The same logic covers CAT's own drift: the IIMs publish no syllabus, patterns shift year to year, and a new set archetype appearing in CAT 2026 should be a row, not a deploy.

## 2026-07-29 — Every DILR set gets a row, including sets the student never opened

**This is the single most important schema decision in the project.** The obvious model logs what the student attempted. But the whole DILR problem is *selection* — with five sets and time for maybe three, the marks come from picking correctly, not from solving faster. Skipped sets carry the information: which ones were walked past, and (once the answers are known) which of those would have been cleared. A `set_attempts` row with `chosen = false` and a `solvable_verdict` of `skipped_would_have_cleared` is the most valuable row in the database, and a model that only records attempts cannot represent it.

Consequence for the logging UI: the student must be prompted for all five sets, and the two or three they ignored are the ones they'll be least inclined to log. That flow needs to be near-frictionless or the signature feature starves.

**Why `time_spent_sec` on an unchosen set is not always zero.** Scanning a set for ninety seconds and rejecting it costs ninety seconds whether or not marks follow. Recording it is what makes "your scan is too slow" a detectable pattern rather than invisible loss.

## 2026-07-29 — Timing provenance is a column, not a footnote

v1 has no in-app timer, so all per-question timing is the student's recollection entered in buckets. That data is genuinely useful in aggregate and genuinely imprecise, and the temptation will be to display it like measurement. `mock_attempts.timing_source` (`measured` / `estimated` / `absent`) makes the distinction structural rather than a UI convention someone forgets. When the in-app timer ships in v3, historical estimated data stays correctly labelled instead of being silently promoted.

## 2026-07-29 — Evidence thresholds are enforced, and published

`insights.supporting_n` and `insights.confidence_label` are `not null`, so an insight cannot be stored without its evidence base. The thresholds themselves (5 sets for a set-selection claim, 30 answers for calibration, etc.) live in `docs/data-model.md` rather than only in code, because the target user is analytical and sceptical and will reasonably ask "on what basis?".

**The cost is accepted deliberately.** A new user with three mocks sees relatively little. That's worse for early engagement and better for trust, and trust is the entire moat — the competing products all have more content, more mocks and more brand. What they don't have is an instrument that refuses to overclaim.

## 2026-07-29 — No file upload, no shared question bank, no AI in v1

**Copyright is the binding constraint, not a preference.** Indian courts treat exam question papers as copyrighted literary works (*ICAI v. Shaunak H. Satya*, (2011) 8 SCC 781, holding that question papers and model answers "are literary works which are products of human intellect and therefore subject to a copyright"). GMAC's terms restrict GMAT items to individual exam preparation and prohibit derivative works. Coaching sites republishing CAT past papers widely is evidence of non-enforcement, not of legality.

The MVP sidesteps the question entirely: **analytics on manually-entered attempt data require no question content at all.** No upload, no bank, no ingestion, no exposure. Whether a student may upload their own purchased mock into a private analytics tool is a real fair-dealing question that needs a lawyer's written opinion — and it can be answered on its own timeline, in parallel, without blocking the build.

**No AI in v1** for a different reason: none of the v1 analytics need it. Every insight described in the functional spec is arithmetic over the attempt tables. Adding a model would add cost, latency, a failure mode and a caps system for zero additional capability.

## 2026-07-29 — Adults, so no consent architecture

Dhruva's most intricate subsystem — parent accounts, invite codes, per-invite consent records, DPDP minor-protection rules, a parent data window deliberately narrower than surveillance — exists entirely because its users are children. MBA aspirants are adults. That whole graph disappears: no `parent_id`, no `child_invites`, no consent versioning. Export and delete remain, since adult data-protection obligations still apply. This is the largest single simplification versus the reference project, and it's worth stating explicitly so nobody ports the pattern over out of habit.

## 2026-07-29 — Ownership on the attempt chain is inherited by join

`question_attempts` has no `user_id`. RLS reaches the owner through `section_attempts` → `mock_attempts` → `user_id`. Denormalising the user onto every level would be faster to query and would create a second source of truth that can disagree with the first — a class of bug that is silent, corrupting, and discovered late. If profiling later shows the joins matter, the fix is an index or a materialised view, not a denormalised column.
