# Changelog

Dated history, newest first. Every iteration adds an entry: what changed, why, and how to test it (CLAUDE.md, workflow rule 4).

## 2026-07-30 — Phase 6: the insight screens

**What changed**
- **`components/Insight.tsx`** — `LockedCard` first, because two archetypes and every below-threshold claim depend on it, and it is the honest-scarcity argument made visible. Also `EvidenceChip` (sample size + confidence, on every live claim), and the light/dark insight card treatments. Every insight on every screen renders through these, so the treatment cannot drift between views.
- **`components/BottomNav.tsx`** — the four tabs. LOG is the brass circle rather than a fourth flat tab: logging is the only *action* in the product, everything else is reading, and time-to-logged-mock is the product metric.
- **`lib/analytics/load.ts`** — the one adapter between database rows and analytics shapes. Deliberately the only file in `lib/analytics/` that touches Supabase and does no arithmetic, so the pure core stays testable. All three screens read it, so they cannot diverge. Counts **complete attempts only**: a half-logged mock would otherwise drag every average down and make a student look like they had regressed.
- **`lib/timeBuckets.ts`** — buckets shared between entry and analytics. `timeTraps` defines a trap as "attempts in the slowest bucket", so separate copies would let a change to one silently stop the other from matching.
- **`/` (designs 1a + 1b)**, **`/playbook` (1c)**, **`/trends` (1h + 1i + 1j)**.

**1a and 1b are one screen, not two.** They are the same layout at 12, 3 and 1 mocks, and the only difference is what has crossed its threshold — so the thresholds do the design work. Verified by deleting the synthetic data and viewing the 1-mock state: "NO CONFIDENT READING YET", descriptive counts under "HERE'S WHAT'S LOGGED, AND NOTHING MORE", "We won't call any of that a pattern yet. It isn't one.", and three locked cards showing 5/30, 2/5 and the playbook shortfall. Those descriptive counts are facts rather than claims, which is why they carry no threshold and a new user isn't shown an empty screen.

**Scope decision.** Designs 1c and 1d are alternative presentations of identical data. 1c (the ranked ledger) ships, because its stated audience — "the student who wants to audit the claim" — is ASHA's whole audience. 1d's verdict-first framing is carried by the recommendation badges and can be added later as a second view with no schema or analytics change.

**Verified against the seeded fixture:** the screens recover the designed profile — scatter plot as `SKIP ON SIGHT` at 0% over 59.8 minutes, Philosophy passages worst at 41% (which is what migration `0005` was for), QA pacing collapsing in Q3 and recovering, calibration at 92/54/24, `PICK FIRST → PICK SECOND → ONLY IF THIRD → SKIP ON SIGHT` reading as a coherent ladder, and the trend view stating its refusal to draw a line on screen.

**Five defects found by running it, all fixed**
- **A below-threshold shape took the `pick_first` slot.** Venn, opened once at a 100% clear rate, had the best marks-per-minute, won the ranking, was then hidden as below-threshold — and the playbook's top visible row read "PICK SECOND" with no first anywhere. Beyond looking broken, it advised picking a shape on evidence too thin to display. Recommendations are now assigned only among shapes that clear the threshold. Two tests added.
- **Sections rendered DILR / VARC / QA.** PostgREST returns `in()` results in no guaranteed order; now sorted by `sections.ordinal`, so nothing hardcodes a sequence. Fixed the score cards and the pacing order together.
- **"The one to act on" surfaced the mildest offender.** The types array is sorted best-first, so `.find()` on slow-and-wrong returned a 60%-accuracy type while a 43%-at-five-minutes type sat further down. Now ranked explicitly worst-first.
- **A claim cited evidence that didn't support it.** "26 of your 79 VARC errors were misreads. That's a habit, not a syllabus gap." — 26 of 79 is a plurality, not a majority. The rationale now cites the 76% non-conceptual share, which is what the claim actually rests on.
- **Skip regret blamed a shape on one instance** ("1 of them were games & tournaments"). Attribution now requires a cluster of at least two, and otherwise says it is too scattered to blame any one shape — plus a stray comma removed from the skip-regret shortfall message.

## 2026-07-30 — Synthetic fixture, and Phase 5: the analytics layer with tests

**Synthetic development data** — `scripts/seed-dev-attempts.mjs`, 8 mocks / 40 sets / 368 question rows. Nothing real can be built against one mock: set-selection needs 5 sets of an archetype, calibration 30 tagged answers, pacing 3 mocks. Three safeguards, because fabricated rows in the same tables as real ones would silently corrupt a student's insights:

1. every source titled `[SYNTH] …`, so it is obvious in the UI and greppable in the database;
2. `--delete` removes exactly those rows, attempts first (because `source_id` is ON DELETE SET NULL, so dropping sources alone would orphan them);
3. **deterministic** — seeded PRNG, no `Math.random`, no `new Date()` — so the same command always yields the same data, which is what makes it usable as a fixture.

The synthetic student has a consistent, deliberate profile: clears Games & Tournaments, has never cleared a scatter plot, fast and accurate on arithmetic, slow and wrong on Time & Work, mostly misreads rather than concept gaps, collapses in QA's third quarter. Phase 5's job was to rediscover exactly that from the rows.

**Phase 5 — `src/lib/analytics/`, no UI.** Pure functions over plain arrays: no Supabase client, no React (architecture.md). Seven insight kinds plus trend and the global confidence chip.

- **`Claim<T>`** makes the honesty rule structural. There is no way to return a claim without its evidence base, and a below-threshold result carries the shortfall message *instead of* a number — so a caller physically cannot render a claim that shouldn't exist.
- **`setSelectionPlaybook`** ranks archetypes by marks-per-minute. `supportingN` is times **opened**, not times seen, or a shape opened once could claim a 100% clear rate on n=7. `clearRate` is null when never opened, because 0% would be a lie. `abandonAfterSec` needs 5 **cleared** sets, since a cutoff derived from two successes is noise dressed as advice.
- **`quadrant`** splits on the student's own medians, not absolute cutoffs — an external standard would be a peer comparison, which rule 4 forbids.
- **`timeTraps`** deliberately claims **no ratio**. The design's "2.4× your median" cannot be supported by four coarse buckets of recalled time.
- **`trend`** has a `readonly trendline: null` field that exists to document a refusal, so nobody adds a slope later thinking it was an oversight.
- **`pacing`** reads `quarterMarks` and never infers it — no v1 flow captures attempt order.

**43 tests, all passing.** `npm test` runs them with `node --test`, which executes TypeScript natively — no test-runner dependency. Suppression is tested as hard as the arithmetic, because a claim that shouldn't exist is worse than one that's slightly off.

**The calibration arithmetic is pinned down.** A test asserts that 41 guesses at 22% costs about **5** marks and explicitly *not* the 14 the design mockup claimed, and that CAT's breakeven accuracy is 25%.

**A bug the unit tests missed, caught by `scripts/check-analytics.ts`.** That script runs every analytic against the live database — tests prove the maths, this proves the wiring and the behaviour on real distributions. It reported `marks lost to guessing = 9.9`, a *positive* loss. The arithmetic was right: guessing a TITA carries no penalty, so it has positive expected value, and the fixture makes VARC verbal-ability questions TITA. The **name and the boolean were backwards** — it would have rendered as "guessing cost you 9.9 marks" when the truth was the opposite. Every unit test until then used MCQ guesses only. Renamed to `expectedMarksFromGuessing` with an explicit sign convention, split `guessingCostsMarks` from `guessingIsMarginal`, and added three tests including a mixed MCQ/TITA paper.

**One test was wrong, not the code.** A time-trap case built 5 of 8 attempts in the slowest bucket and expected a flag. But a trap is an *outlier* within a type — the spec says "far more than their own median for that type" — so a majority-slow type is systematic slowness, which belongs in the quadrant as slow-and-wrong. The fixture was corrected and a second test now pins the distinction.

**Verified against the live fixture:** the analytics recover the designed profile — Scatter plot → `skip_on_sight` at 0% clear with negative marks/minute over 60 minutes spent; Time & Work `slow_wrong` at 39% and 300s; QA pacing weakest in Q3 and **recovering** (so the time was there) while VARC and DILR taper to Q4 and don't; calibration back at 92 / 54 / 24; two archetypes correctly locked with shortfall messages; `trendline` null.

## 2026-07-30 — Phase 4: VARC/QA question entry, both modes

**What changed**
- **Routes restructured.** `/log/[attemptId]/dilr` is gone. `/log/[attemptId]/section/[code]` now serves every section and branches on data: a section owning `set_archetype` nodes renders the set sheet, anything else renders the question sheet. Nothing knows the string "DILR".
- **`/log/[attemptId]`** — new attempt overview. Three sections with per-section progress, whether each logs by set or by question, and the button that marks the attempt complete. Needed because a mock is logged section by section and the student is expected to stop halfway; without it, "resume" has to guess where they were.
- **`QuestionSheet`** — designs 1e and 1f. Mode picker per section, batch grid, card-by-card walk, and a shared detail editor used by both (batch reuses it for the exception pass).
- **`marking.ts`** gains `questionMarks`, `totalQuestionMarks`, `freeSkips`. Unlike set-level marking this *can* honour the TITA rule, because response format is per question.
- **TITA capture.** Every question defaults to MCQ with a one-tap TITA toggle. This was offered as a decision and not answered, so the recommended option was taken and stated plainly: it costs a tap on roughly eight questions per paper and buys the mechanical check "you left N TITA questions blank — those carry no penalty, so a guess was free". Trivially removable.

**Design decisions**
- **Batch mode's honest cost is shown, not hidden.** It only tags confidence on exceptions, and calibration needs *both* diagonals — confident-and-wrong and unconfident-and-right. The second is invisible if you only tag what went wrong. So the footer reads `2/24 CONFIDENCE-TAGGED` live, and calibration will count only tagged answers. Nothing is assumed for untagged ones.
- **Question type is optional in batch mode.** Design 1f shows a type against every row, but ASHA cannot know the paper's types — only the student can assign them, and 24 assignments would defeat the point of batch. Untyped rows save as `Untyped`; type-dependent analytics will count only typed rows.
- **Running totals in the footer** rather than only at the end, so a mis-entry is visible while the paper is still open in front of them.

**Verified end to end on the live attempt**
- Overview derives `BY SET` / `BY QUESTION` from archetype ownership, and showed DILR already `LOGGED 22/22` from Phase 3.
- VARC in **batch**: 24 rows defaulting to Right, tally moving to 21/2/1, exception pass walking only Q04 → Q09 → Q17, saved with correct marks (21×3 − 2 = **61**).
- QA in **cards**: type picker grouped exactly as seeded — Arithmetic 8, Algebra 9, Geometry 6, Number systems 4, Modern maths 4 = 31 leaves. No passage-domain picker appears, correctly, since QA owns none.
- **Both calibration diagonals captured**: VARC has one confident-and-wrong (confidence 3 + incorrect), QA has one unsure-but-right. The second is exactly what batch mode cannot see, and it came from cards mode — which is the argument for shipping both, now demonstrated rather than asserted.
- Skipped questions store `confidence = null`; DILR still has zero question rows, as it is logged at set level.
- Marking complete moved the attempt from "pick up where you left off" to "LOGGED".

**Two defects found by running it, both fixed**
- **"SAVE & EXIT" did not save.** It only navigated, in both the batch grid and the detail editor — breaking the one promise this flow makes. In card-by-card mode it was the only way to preserve partial work, since the final Save appears on the last question. It now persists and then routes. (SetSheet's equivalent was already honest: it writes each set on "Add this set".)
- **`1 TITA questionleft blank`** — a `{expr} word` JSX boundary silently ate its space. Rebuilt as a single interpolated string so it cannot recur.

## 2026-07-30 — Phase 3: the mock log and the DILR set sheet

**What changed**
- `supabase/migrations/0006_set_tally.sql` — `num_attempted` and `num_correct` on `set_attempts`, both nullable, with a check constraint enforcing `correct ≤ attempted ≤ num_questions`. Added because `marks_earned` alone is a derivation: without the raw counts, marks cannot be recomputed from a corrected `exam_configs` row, and "answered 4 of 4, got 4 right" becomes indistinguishable from "answered 1 of 4, got 1 right".
- `src/lib/marking.ts` — pure functions, no DB and no React. `setMarks`, `reconcileSectionScore`, `questionCoverage`. Every figure reads a scheme out of `exam_configs`; nothing is hardcoded.
- `/log` — attempts list, unfinished ones surfaced first under "PICK UP WHERE YOU LEFT OFF".
- `/log/new` — attempt creation. No such screen exists in the handoff (the mockups begin at "SimCAT 12 · DILR"), so it was designed to the same visual language.
- `/log/[attemptId]/dilr` — the set sheet (design 1g).
- `src/lib/supabase/relations.ts` — `one()`, which narrows an embedded to-one relation. supabase-js types every embed as an array without generated types, so `attempt.mock_sources.title` fails to typecheck though it works at runtime. Narrowing rather than casting, since a cast would lie.

**Design decisions**
- **Completeness is question accounting, not a set count.** The sheet shows `18 / 22` and is done when set sizes sum to `sections.question_count`. Nothing hardcodes five sets — the DILR set count is an exam fact that has varied — and over-counting is flagged as a probable duplicate.
- **Which section is "DILR" is resolved from data.** The set-based section is whichever owns `set_archetype` taxonomy nodes. The URL says `dilr` because that is what a CAT aspirant calls it, but no query depends on the name.
- **Section scores are entered and cross-checked.** The student types them off their result page; ASHA also totals the logged rows and flags a gap. A forgotten set is otherwise invisible, and skipped sets are the entire basis of the set-selection engine.
- **A known limitation, deliberately accepted.** Set-level logging cannot tell which questions were TITA, so `setMarks` applies MCQ negative marking throughout and is therefore conservative. That is why the cross-check carries a tolerance of one correct answer's worth rather than demanding an exact match, and why the mismatch card says so rather than implying the student mis-entered something.
- **Deviation from the mockup.** Design 1g renders sets as `4/4 +12` and `1/4 −1`; those cannot both be correct/total, since 1 correct of 4 under +3/−1 is 0 marks, not −1. Answered and right are captured as separate counters and marks computed from config, displayed as `0/1 of 4`.

**Verified end to end against the live project**
Five sets logged on a real attempt, covering every verdict:

| Set | Shape | Verdict | Stored |
|---|---|---|---|
| 1 | Games & tournaments | `cleared` | att 4, cor 4, ord 1, 540s, **+12** |
| 2 | Scatter plot | `attempted_failed` | att 1, cor 0, ord 2, 720s, **−1** |
| 3 | Arrangements | `abandoned_midway` | att 0, cor 0, ord 3, 360s, **0** |
| 4 | Venn diagrams | `skipped_would_have_cleared` | att/cor **null**, chosen false, 60s scan |
| 5 | Quant-heavy DI caselet | `skipped_correctly` | att/cor **null**, chosen false, 0s |

Totals: 22 questions, 11 marks. Row 4 is the one `decisions.md` calls the most valuable in the database — a set walked past that would have been cleared, with its scanning time recorded — and it now exists. Also confirmed: `/log` resumability, marks computed from `exam_configs`, the cross-check firing at completion ("your sets come to 11 marks, but you reported 27"), and the skip-regret note carrying its threshold caveat ("needs 5 skipped sets across 3 mocks before ASHA will call it anything").

**Three defects found by running it, all fixed**
- **The mismatch warning fired with zero sets logged.** True but useless — until every question is accounted for the running total is *supposed* to be short, and a warning that cries wolf trains the student to ignore the one warning here that matters. Now gated on completeness.
- **"Started, then bailed" was unloggable.** Validation required at least one answer on an opened set, but abandoning after six minutes without committing an answer is a real outcome — it is design 1g's own third card (`0/5`).
- **`~0 MIN`** read as an approximation of nothing. Zero is exact — they didn't look at it — so it now reads "NO TIME SPENT".

**Process note:** migration `0006` took three rounds to land. The first failure surfaced as PostgREST's `Could not find the 'num_attempted' column ... in the schema cache`, which is ambiguous between a stale API cache and a missing column. `notify pgrst, 'reload schema'` disambiguated it, after which Postgres reported `42703 column does not exist` — definitive. Worth remembering: when PostgREST reports a missing column, reload the cache before assuming either cause. Also, pasting the SQL inline into chat rather than pointing at a file path is what finally got it run.

## 2026-07-29 — Phase 2: phone-OTP auth and the profile screen

**What changed**
- `lib/supabase/{client,server,service}.ts` — browser, cookie-based server, and service-role clients. ASHA is middleware-less, following Dhruva: session gating lives in the Server Components that need it, and there is no `middleware.ts`.
- `lib/otp.ts` — `isDevMode`, `computeDevOtp` (salted `asha-dev-otp:` so a number's dev code differs from Dhruva's on the same machine), and `isReservedTestPhone`, which is **deliberately empty**: no synthetic test numbers are reserved yet (builder's decision), and the check is pre-wired so reserving one later is a one-line change.
- `lib/msg91.ts` + `lib/msg91Widget.ts` — server-side widget token verification and the headless client loader, ported with Dhruva's live-found gotchas intact (the widget initialises *after* its script's onload, so polling for the exposed methods is required).
- `api/otp/send` and `api/otp/verify` — dev-mode deterministic code, real-mode widget token verification, then the session bootstrap.
- `AuthFlow.tsx` (design 2a), `profile/page.tsx` + `profile/ProfileForm.tsx` (design 2b), and `page.tsx` as the session gate.
- **Fonts moved from `next/font/google` to Fontsource** — see `decisions.md`; the former needs build-time egress to Google and 500'd every page here.

**Why the auth mechanism looks strange**
Supabase has no server-side session API for phone users (`admin.generateLink` is email-only). The server verifies the OTP, find-or-creates the auth user, sets a fresh 256-bit random password, and hands it to the browser once over HTTPS; the browser then runs a normal `signInWithPassword`, which is the only path that persists session cookies correctly. Dhruva's notes record that server-side `setSession` and token-handoff were both tried and both failed. The password is deliberately **not** rotated afterwards, because Supabase revokes sessions on an admin password change.

**A bug caught before it ran:** Dhruva calls `rpc("get_user_id_by_phone", { phone_input })`; ASHA's migration `0001` declares the parameter `p_phone`. Copying that line verbatim would have failed at runtime with an unhelpful PostgREST error.

**Verified**
- `npm run typecheck`, `npm run lint`, `npm run build` — all clean; routes `/`, `/profile`, `/api/otp/send`, `/api/otp/verify`.
- Design 2a renders at a 360px viewport, both the phone step and the OTP step.
- `/api/otp/send` works: the dev code printed to the server console (`602932` for 9000000001) matched an independently computed value, so `computeDevOtp` agrees end to end.
- The OTP input's invisible-overlay geometry is correct — `elementFromPoint` at its centre returns the input itself, enabled, `pointer-events: auto`.

**FINAL: Phase 2 verified end to end against the live project**

Full flow confirmed working on the builder's machine: phone → OTP → sign-in → profile → save → signed-in home, then a reload going straight past the profile screen. Specifically proven:

- The password handoff works. Landing on `/profile` means `signInWithPassword` succeeded **and** the session cookies persisted, because `/profile` is a Server Component that read the session back.
- The row written is correct: `name`, `target_exam = CAT`, `target_year = 2026`, `target_percentile = 99`, `prep_mode = online` (design label "Coaching" → stored `classroom` mapping intact).
- `target_year` came from `exam_configs.effective_year`, not a constant — no exam facts in code.
- RLS scopes reads: an unfiltered `select *` on `users` as the signed-in user returned exactly one row, their own.
- Returning-user routing works: a session with a profile skips `/profile`.

**The blocker was a dashboard setting, and it cost two rounds.** Supabase's Phone provider was off. Enabling it requires SMS provider credentials that ASHA never uses — MSG91 sends the OTP and Supabase's phone identity is only the account key — so format-valid dummy Twilio values are entered (`AC…`/`MG…` + 32 chars). This is **not recorded anywhere in Dhruva's docs**, which is exactly why it could not be recalled; it is now in `architecture.md` under "Supabase dashboard configuration". Diagnosing it took querying `/auth/v1/settings` directly for `external.phone`, which is far faster than inferring it from a failed login.

**Two defects found by running it:**
- `You're signed in, Arjun R..` — double full stop, because a name may already end in one. Fixed; never append punctuation straight after a user-supplied name.
- The design's greyed **"GMAT — soon"** chip does not render, because no GMAT row is seeded. That is correct per the scope fence, and `data-model.md` had wrongly claimed such rows existed. Doc corrected, with a note not to "fix" the chip by hardcoding an exam name.

**Update, same day — server half verified (superseded by the above)**

Re-tested against the builder's own `npm run dev` (port 3001; Dhruva holds 3000). `/api/otp/verify` returned **200 OK**, which proves the whole server-side chain works: the `get_user_id_by_phone` RPC with `p_phone`, `auth.admin.createUser({ phone })`, the password set, and the profile lookup. The resend countdown ticks correctly too.

Sign-in then failed with Supabase's `Phone logins are disabled` — a **dashboard setting, not a code defect.** The Phone provider must be enabled under Authentication → Sign In / Providers; migrations cannot set it. Now documented in `architecture.md` under "Supabase dashboard configuration", including the note that the SMS provider credentials Supabase asks for go unused, because MSG91 sends the OTP and Supabase's phone identity is only the account key.

Worth noting how this failure presents: the server returns 200 and the user is created, so the error appears at the very last step and looks like a broken session handoff rather than a missing toggle.

**Left behind by testing:** an auth user for `+919000000001` with no profile row. Harmless, but deletable from Authentication → Users.

**Still unverified after that toggle:** `signInWithPassword`, the profile insert, and the `/profile` screen.

**NOT verified at the time of the original entry — everything past OTP entry**
`/api/otp/verify` failed with `TypeError: fetch failed`, because **this development sandbox cannot reach `*.supabase.co`** (DNS returns ENOENT for the project host, while npm resolves). The host machine resolves it fine, so this is an environment limitation, not a code defect — but it means the following are written and unproven: auth user creation, the password handoff, `signInWithPassword`, the profile insert, and the entire `/profile` screen. **These must be tested on the builder's machine before Phase 2 is called done.**

**How to test (on the builder's machine, not the sandbox)**
1. `npm run dev`, open the app, enter any 10-digit number.
2. Read the six-digit code from the terminal — it is printed as `[dev-otp] Code for +91…`.
3. Enter it. Expect: profile screen → fill four fields → "Log my first mock" → the signed-in placeholder greeting you by name.
4. Refresh mid-profile: it should stay on `/profile`, because that state lives in a real URL.
5. Sign in again with the same number: it should skip the profile screen and go straight to the placeholder.

## 2026-07-29 — Supabase project live; Next.js scaffolded

**What changed**
- **Supabase project created and migrations `0001`–`0005` applied** via the dashboard SQL Editor. `supabase/verify.sql` returns PASS on every check: twelve tables, RLS on all of them, expected policy shapes, no write policies on the four shared reference tables, `0005`'s column + constraint + trigger present, `get_user_id_by_phone` is security definer, taxonomy empty.
- Rewrote `verify.sql` as a **single** UNION ALL query. As eight separate `SELECT`s it was broken in practice: the SQL Editor returns only the last statement's result, so checks 1–8 were computed and silently discarded.
- Scaffolded Next.js — `package.json`, and `tsconfig.json` / `next.config.ts` / `postcss.config.mjs` / `eslint.config.mjs` copied verbatim from Dhruva.
- `src/app/globals.css` — the handoff's palette and type as Tailwind 4 `@theme` tokens, so no component hardcodes a hex.
- `src/app/layout.tsx` — Instrument Sans + IBM Plex Mono via `next/font` (self-hosted at build, no runtime Google Fonts dependency), plus the Apple-specific PWA metadata and the ink `themeColor`.
- `src/lib/thresholds.ts` — evidence thresholds as the single source of truth, with `meetsThreshold`, `confidenceLabel`, `shortfallMessage`. `confidenceLabel` returns null below threshold rather than `"low"`, so a caller cannot accidentally render a label for a claim that should not appear.
- `src/app/page.tsx` — placeholder so the build has an entry point; becomes the session gate in Phase 2.
- **Security:** `next` pinned to 16.2.12, not Dhruva's 16.2.10, which carries nine advisories including an App Router middleware bypass and unauthenticated Server Function disclosure. `overrides` for `sharp` and `postcss`. Reasoning in `decisions.md`.

**Why**
Phase 1 of the build plan: get the schema live and verified, then scaffold enough to seed. The Next version bump was not planned — it came out of reading `npm audit` against the installed version rather than trusting the summary count.

**How to test**
- `npm run typecheck` — clean.
- `npm run build` — compiles, 3 static pages, no warnings.
- `npm audit` — 0 critical, 9 high, all in the dev-only eslint chain (see `decisions.md`).
- `supabase/verify.sql` in the SQL Editor — every row PASS.

**Taxonomy seeded — Phase 1 complete**
`npm run seed` succeeded. All database assertions passed on their first ever run: 3 sections, 75 nodes total, VARC 21 / DILR 18 / QA 36, 56 question types / 12 set archetypes / 7 passage domains, 10 root nodes.

Two things had to be fixed to get there, both now guarded against:

- **New-format Supabase keys.** The dashboard has moved to `sb_publishable_…` / `sb_secret_…` in place of `anon` / `service_role`. Verified in the installed `supabase-js` 2.111.0 that these are handled first-class — `isNewApiKey()` routes them to the `apikey` header and never as a Bearer token — so the new keys are correct and the Legacy tab is not needed. The env var names still say `ANON_KEY` / `SERVICE_ROLE_KEY`; that is cosmetic, and renaming would diverge from Dhruva's naming for no gain.
- **`PGRST125 Invalid path specified in request URL`.** `SUPABASE_URL` had been set to the *RESTful endpoint* (`…supabase.co/rest/v1/`) rather than the Project URL. `supabase-js` appends `/rest/v1/<table>` itself, so the path doubled and PostgREST rejected every request with an error that says nothing about the cause. The seed script now refuses a `SUPABASE_URL` carrying any path, and names the expected origin.

Also added a preflight that reports *which* env vars are missing and where each comes from, instead of surfacing supabase-js's bare `supabaseUrl is required` stack trace.

**Security note**
Live MSG91 credentials had been entered into `.env.local.example`, which is committed (only `.env.local` is gitignored). Moved into `.env.local` and blanked in the template before any repo existed, so nothing leaked. The seed script's error text now points this out where someone is most likely to make the same mistake.

## 2026-07-29 — Repo structure, migration 0005, seed assertions

**What changed**
- Renamed the project *Sextant* → **ASHA**; amended `CLAUDE.md` to Dhruva's structure and moved web + Android APK + an installable PWA for iPhone into v1 scope. Reasoning in `decisions.md`.
- Reorganised into the documented layout: `docs/`, `scripts/`, `supabase/migrations/`. This also fixed the `docs/*.md` links in `CLAUDE.md`, which previously pointed at files sitting in the repo root.
- Added `supabase/migrations/0005_passage_domain.sql` — a third taxonomy `kind` (`passage_domain`), a nullable `passage_domain_id` on `question_attempts` with a partial index, and a trigger enforcing that it points at a passage-domain leaf.
- `scripts/seed-cat-taxonomy.mjs` now asserts its result — duplicate-code detection before writing, node counts per section and per kind, re-read verification against the live database, and a cross-check that section question counts sum to `exam_configs.total_questions`. Exits non-zero on any mismatch.
- Added `supabase/verify.sql`, `.env.local.example`, `.gitignore`.
- Corrected `data-model.md`: the schema is twelve tables, not the nine previously claimed.

**Why**
Reconciling the design handoff against the specs surfaced several places where a screen showed a number the schema could not produce, or where seeded reference data was unreachable. `0005` fixes the unreachable passage-domain nodes; the seed assertions close a silent-failure path where a duplicated code would overwrite a node and quietly delete a capability. Both are recorded in `decisions.md`.

**How to test**
- `node --check scripts/seed-cat-taxonomy.mjs` parses.
- The literal assertions pass against the real tree: 75 nodes, VARC 21 / DILR 18 / QA 36, 56 question types / 12 set archetypes / 7 passage domains, 68 questions across three sections. Verified, including that the assertions genuinely fail on a duplicated code, a deleted node, and a tagging `kind` on a grouping node.
- The database-side assertions in `verifyDatabase()` are **not yet exercised** — they need a live Supabase project and run for the first time at seeding.

**Status**
Still pre-build: no live database, no application code. Migrations 0001–0005 are written and ready to apply.
