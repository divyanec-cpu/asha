# CLAUDE.md — ASHA

**Read this before writing any code.** This file is the constitution. If a proposed change contradicts anything here, the change is wrong until this file is amended in the same commit, with the reasoning written into `docs/decisions.md`.

## What this project is

**ASHA** is a mock-test analytics companion for MBA-entrance aspirants in India. **CAT first.** GMAT and MAT are configuration, not v1.

Tagline: *"You've taken the mock. Now find out where you stand."*

**Positioning (never violate this):** ASHA is NOT a coaching app, NOT a teaching platform, and NOT a mock-test seller. It is a wrap-around instrument for students who already have mocks (SimCAT, AIMCAT, iCAT, Career Launcher, past papers) and already have teachers. The mocks test; the coaching teaches; ASHA reads *the student's own attempt data* across many mocks and tells them, with stated confidence, where they actually stand and what to change before the next one.

The instrument metaphor is the product rule: a sextant does not steer the ship, it takes a position fix. ASHA tells you where you are; the decisions stay yours.

**Do NOT build:** lectures, concept content, a shared question bank, percentile prediction, leaderboards, or anything that competes with coaching institutes or mock providers. When in doubt, ASHA measures and reports; it does not teach and does not rank.

**The builder is a coding novice.** Explain changes in plain English. Prefer simple, boring, well-documented solutions over clever ones. Never assume prior programming knowledge in explanations.

## Positioning — hard product rules

These are not preferences. Breaking one is a bug.

1. **ASHA does not teach.** No lectures, no concept videos, no original syllabus content. It diagnoses and points at what to revise.
2. **ASHA is not a mock bank.** It never ships a shared library of CAT/GMAT/MAT questions. See "Content and copyright" below — this is the legal moat, not a feature choice.
3. **ASHA never claims more than the data supports.** Every insight carries the sample size it rests on and a confidence label. An insight below the evidence threshold is not shown at all. Overclaiming from n=2 is the fastest way to lose a serious aspirant.
4. **No leaderboards, no ranks, no peer comparison.** Every number a student sees is their own. Percentile is a field the student *reports from their mock platform*, never something ASHA computes or implies.
5. **ASHA never fabricates data.** If timing was estimated rather than measured, every analysis built on it says so. See "The honest-data rule."
6. **Time-to-logged-mock is the product metric.** Any feature that raises it without moving "insight acted upon" gets cut. If logging a mock takes 30 minutes, nobody does it twice.
7. **Every marks figure is computed from `exam_configs`, never hardcoded.** Marking rules (+3 / −1 MCQ / 0 TITA for CAT) live in data. A hand-written arithmetic constant in analytics code is a bug even when it happens to be right today. *(Added 2026-07-29 — the design mockup's calibration screen claimed a marks loss that does not follow from CAT marking. See `docs/decisions.md`.)*

## Who uses it

Adults. Working professionals and final-year students, 20–30, time-poor, taking 10–30 mocks over a season, already spending two hours or more analysing each mock by hand in a spreadsheet they built themselves.

**No minors, so no DPDP child-consent architecture** — this is the biggest structural simplification versus Dhruva. There is no `parent_id`, no `child_invites`, no consent versioning, no date-of-birth gate. Do not port that graph over out of habit. Standard adult data-protection obligations still apply: export and delete must work from day one.

## The core loop (the product spine)

1. **Log a mock.** The student takes a mock wherever they normally do, then creates an attempt in ASHA — source ("SimCAT 07"), date, reported score, reported percentile — and walks three sections. Target: **under ten minutes**, folded into the review they were doing anyway. Entry is resumable; a half-logged mock is the likeliest churn event.
2. **DILR is logged at set level, not question level** — all five sets including the ones never opened, each with archetype, pick order, time spent (scanning counts), and, once the answers are known, the verdict: cleared / attempted-failed / skipped-would-have-cleared / skipped-correctly / abandoned-midway.
3. **VARC and QA are logged at question level** — outcome, confidence declared before checking, a time bucket, question type, and for anything wrong or skipped, the error cause: concept / misread / silly / time.
4. **Insights recompute** over the student's full history on completion, and only render at or above their evidence threshold.
5. **Act before the next mock.** The set-selection playbook, the accuracy-vs-time quadrant, pacing, calibration, error causes, and the cross-mock trend. `insights.acted_on` is the primary value metric.

**Confidence-based marking (applies to every logged question):** the student picks confidence 1/2/3 *before* checking the answer. Two patterns matter — confidence 3 + incorrect (guessing into negative marking) and confidence 1 + correct (leaving winnable marks on the table). Neither is visible without the tag.

## Tech stack (fixed — do not propose alternatives)

Deliberately identical to Dhruva so nothing is re-learned. Match Dhruva's major versions (`C:\1 PROJECTS\Dhruva\app\package.json`) rather than taking the newest of anything.

**Exception, and it is not a licence to drift: patch-level security bumps within the same major.minor are expected and need no amendment.** ASHA runs `next` 16.2.12 rather than Dhruva's 16.2.10 because 16.2.10 carries nine advisories including an App Router middleware/proxy bypass and unauthenticated disclosure of internal Server Function endpoints — all patched in 16.2.11. Do not "restore consistency with Dhruva" by pinning back. Run `npm audit` after any dependency change and check advisories against the installed version, not against npm's aggregate vulnerable range, which is wide enough to flag patched builds. See `docs/decisions.md`.

- **Frontend:** Next.js (App Router) + React + Tailwind CSS + TypeScript. Mobile-first layouts — **design at 390px** (the handoff frame), **test at 360px** (the cheapest real Android). PWA-enabled (manifest + service worker).
- **Android packaging:** Capacitor wraps the same codebase into a signed APK — sideloaded trials first, Play Store later.
- **iOS: the PWA, not a native app, in v1.** iPhone users open the same Vercel URL in Safari and **Add to Home Screen** — icon, fullscreen, no browser chrome. Because the Android app is itself only a WebView over that URL, an installed PWA and the APK are near-identical experiences. A native Capacitor iOS build is deferred until there is a reason the PWA can't cover. See "Platform reality" below.
- **Capacitor mode: remote URL, exactly as Dhruva does it.** `server.url` points at the Vercel deployment; `webDir` is a never-served placeholder that Capacitor requires anyway. Consequence, and it is the reason for the choice: **every push to `main` updates the web app and the APK at once, with no reinstall and no store review.** Consequence to accept: the app requires a network connection.
- **Backend/DB/Auth:** Supabase (Postgres, **Row Level Security ON for every table, no exceptions**, Supabase Auth). Login is phone OTP: the MSG91 OTP Widget in production (the server verifies the widget's access token and derives the phone from it), a deterministic dev-mode code on localhost (the widget's hCaptcha refuses localhost — a Dhruva finding, not a guess). Adults only, so no invite or consent flow: a new number goes straight to profile setup.
- **Hosting:** Vercel. Auto-deploys on every push to `main` on a **private** GitHub repo. `npx vercel --prod` from the repo root as a manual fallback.
- **Runtime AI: NONE in v1.** The app must be fully functional with zero model calls, because every v1 insight is arithmetic over the attempt tables. This is the deliberate difference from Dhruva. If AI arrives in v2 it is server-side only, per-user capped, success-only logged, with a graceful non-AI fallback — the Dhruva pattern.
- **Version control:** Git. Commit after every working feature with a clear message.

### Platform reality — iPhone users are served by the PWA

**iOS is covered in v1 without a native app.** iPhone → Safari → Add to Home Screen. There is no App Store listing, no Xcode, no Mac, no Apple Developer membership, and no Guideline 4.2 review risk, because nothing is submitted to Apple. Since the Android app is a WebView over the same URL, the PWA is not a lesser tier — it is the same thing with a different installer.

**But iOS ignores most of `manifest.json`, so the PWA needs Apple-specific work:**

- `apple-mobile-web-app-capable` — without it, Add to Home Screen produces a Safari bookmark, not a fullscreen app.
- `apple-mobile-web-app-status-bar-style` set for the dark ink header (`#12151A`), or a white band sits above it.
- `apple-touch-icon` at the required sizes; iOS does not read the manifest's `icons` array.
- `apple-touch-startup-image` for the launch screen.
- **An install prompt for iOS Safari visitors.** Add to Home Screen is a share-sheet action most people don't know exists; without a nudge, most iPhone users end up with a browser tab instead of an app. Treat this as a real conversion step, not a nicety.

**Known iOS PWA limits, and whether they matter here:**

- *Web push requires the PWA to be home-screen installed.* Irrelevant in v1 (no notifications). It becomes load-bearing if a "log your mock" nudge ever ships — note it then, don't build for it now.
- *Safari evicts cached data for sites unused ~7 days.* Irrelevant: attempt data lives in Supabase, not local storage.
- *No offline use.* Already true of the APK in remote-URL mode.

**When a native iOS app would actually be needed:** an App Store listing for discoverability, or a native capability the web cannot reach. Neither is a v1 requirement. Revisit only against a real reason, and read the Guideline 4.2 problem in `docs/decisions.md` first — a remote-URL WebView shell is the textbook shape Apple rejects.

## The honest-data rule

ASHA's core asset is trust in its numbers. Four enforcement mechanisms, all mandatory:

- **Timing provenance.** Every mock attempt records `timing_source`: `measured` (captured by ASHA's own timer), `estimated` (the student's recall, entered in buckets), or `absent`. Analytics that depend on timing must surface the provenance. Never average measured and estimated timings into one figure without saying so. In v1 everything is `estimated`.
- **Evidence thresholds.** No weakness/strength claim about a question type or set archetype is emitted below the minimum for that claim class (see `docs/data-model.md`). Below threshold, the UI says what is missing — "3 more Games & Tournaments sets before this is reliable" — which is itself useful.
- **Reserved fields stay empty and stay labelled.** If a column exists but nothing populates it yet, it is marked *reserved* in `docs/data-model.md` and no UI reads it. Never render a zero as if it were a measurement.
- **Every derived number on screen has a published formula.** If a screen says "+14 vs your last three", "the spread is ±11", or "abandon at six minutes", the derivation lives in the *Derived measures* section of `docs/data-model.md` and is gated by its own threshold. **A plausible-sounding number with no traceable derivation is fabrication**, and rule 5 forbids it. Descriptive counts of what the student logged ("you attempted 4 DILR sets and cleared 1") are always allowed at any n, because they are facts rather than claims.

## Content and copyright — non-negotiable

- **Never ingest, OCR into a shared table, or re-serve any exam's questions.** Indian courts treat exam papers as copyrighted literary works (*ICAI v. Shaunak H. Satya*, (2011) 8 SCC 781). GMAC's terms are explicitly hostile to any reproduction of GMAT items and restrict them to individual exam preparation.
- **The student's uploaded material is private, forever.** Files live in a per-user storage folder, are never read cross-student, are never used to seed shared content, and are never sent to an AI service without the student's explicit per-file action.
- **GMAT content is off-limits even as a private upload** until counsel says otherwise, given GMAC's individual-use licence language. GMAT support means analytics on the student's own *results*, nothing else.
- **Original practice content only**, if and when micro-quizzes ship: hand-written or agent-drafted-and-hand-verified items over public-domain passages. Never "in the style of" reproductions of real items.
- **Open legal question, flagged deliberately:** whether a student uploading their own purchased mock into a private analytics tool is defensible fair dealing. This needs an IP lawyer's written opinion before any upload feature ships. Until then, build the analytics against *manually entered attempt data only* — which requires no upload at all, and is the MVP anyway.

## Scope boundary — v1

The single biggest failure mode across previous builds was scope creep. This is the fence.

**IN v1:**
- CAT only.
- Post-hoc structured review entry: the student replays a mock they took elsewhere and logs it. Resumable.
- The DILR **set-selection engine** — the signature feature. All 5 sets logged including the skipped ones; a personal pick/skip playbook out the other end.
- Core analytics: accuracy and time by question type, the accuracy-vs-time quadrant, marks-per-minute, time-trap flags, confidence calibration, error-cause tagging, pacing by section quarter.
- Cross-mock trend view with explicit confidence labels and **no trendline** through noise.
- **Two selectable question-entry modes per section** *(scope decision 2026-07-29)*: a batch grid (everything defaults to correct, tap only the exceptions) and per-question cards (full tagging). The student picks per section. Calibration counts only explicitly tagged answers, so batch mode grows that sample more slowly and must never imply otherwise.
- Passage-domain tagging for VARC RC, via a nullable second tag *(scope decision 2026-07-29 — migration `0005`)*.
- Help and About screens. The About screen states the refusals plainly, because "what it won't do" is why a sceptical aspirant trusts it.
- Export (one file, everything) and delete (permanent, and it actually deletes). Both from day one, reachable from About, not buried in settings.
- **Web + Android APK + an installable PWA that covers iPhone** *(scope amendment 2026-07-29 — see `docs/decisions.md`)*. The PWA work is the Apple-specific meta tags, icons, and the iOS install prompt — not a second UI.

**OUT — do not build these in v1, even if asked casually. Confirm first.**
- In-app timed test mode (v3). This is what would make `timing_source = 'measured'` possible; until then all timing is the student's recall.
- GMAT and MAT configs (v3 — the schema supports them; the seed data and UI do not ship).
- Micro-quiz / flashcard / Leitner layer (v2 at the earliest). `revision_queue` is reserved for it and stays unread.
- OCR of result screenshots (v2).
- Any AI question generation. Any AI chat.
- XAT / NMAT / SNAP / CMAT.
- File upload of mock PDFs (blocked on the legal opinion regardless).
- Percentile prediction, in any form, ever.
- **Native iOS app and App Store submission.** iPhone is served by the installable PWA in v1. A Capacitor `ios/` platform is not added, because it would need a Mac, an Apple Developer membership, and a Guideline 4.2 mitigation for zero capability the PWA doesn't already give. Revisit only against a concrete reason.

**Advance gates.** v1 → v2 requires: a real user has logged **≥5 mocks** and returned to the set-selection view before their next mock. v2 → v3 requires: **>40% of active users log ≥3 mocks** and self-report that an insight changed their set-selection behaviour. No gate, no next stage.

> **The v1 → v2 gate was OVERRIDDEN on 2026-08-01 by explicit builder decision, unmet.** At the time of override: **1 real mock logged** (by the builder, while testing) against a requirement of 5, and the 4 `acted_on` insights had been set by hand while verifying carry-forward. On the metric that matters the count was effectively zero.
>
> This is recorded rather than quietly erased because the gate is the mechanism that was supposed to stop a fourth build dying of scope creep, and this is the first time it was tested against a real request. Reasoning in `docs/decisions.md`.
>
> **The v2 → v3 gate was then ALSO overridden, on 2026-08-03, two days later.** At the time: **0 users with ≥3 mocks**, 1 real mock in the database, no behaviour change recorded — the gate was not merely unmet but unmeasurable, since it is a percentage of active users and there were none. When the v1 → v2 override was written it said in this same paragraph that it "is not a precedent for overriding that one". It became one within two days. That sentence is left in the history above rather than edited out, because a constitution that quietly rewrites its own predictions is worth nothing.
>
> **Both gates are now spent. There is no remaining mechanism in this document that can stop scope from expanding** — only the builder's judgement, which is what the gates existed to supplement.

## Scope boundary — v3 (opened 2026-08-03)

**IN v3, in the order being built:**
- **In-app timed test mode.** ASHA runs the section clock while the student works through a mock they already own, capturing per-question time and attempt order as they happen. This is what makes `timing_source = 'measured'` real, and it also finally populates `question_attempts.order_index`, which no earlier flow captured. **No analytic changes** — that is the point of the provenance column.
- **GMAT and MAT configs.** Seed data only: exam rows, `exam_configs` marking per pattern, sections, and a taxonomy per exam. Each pattern must be independently verified before seeding, because a wrong marking rule silently corrupts every figure for that exam.

**Also now opened, from v2's remainder:**
- **OCR of result screenshots** — introduces runtime AI and a recurring bill. Requires server-side only, per-user caps, success-only logging and a graceful non-AI fallback (the Dhruva pattern).
- **Micro-quizzes** — requires original hand-written or agent-drafted-and-hand-verified content. Never reproductions of real exam items; the copyright rule is unchanged and unchangeable.

**Still OUT:** XAT / NMAT / SNAP / CMAT. File upload of mock PDFs (blocked on the IP opinion). Percentile prediction, in any form, ever. Native iOS app and App Store submission. A shared question bank — this one is not a scope decision and cannot be opened.

## Scope boundary — v2 (opened 2026-08-01)

**IN v2:**
- **Spaced revision queue over question types.** Uses the `revision_queue` table as originally shaped — `question_type_id`, Leitner box 1–5 → 1-3-7-14-30 days. Needs no practice content and no AI. See "Revision queue discipline" below.

**Still OUT, and not opened by this amendment:**
- **OCR of result screenshots.** Would need runtime AI, which v1 deliberately has none of, plus caps, success-only logging, a non-AI fallback and a monthly bill.
- **Micro-quizzes with practice content.** Requires original hand-written or agent-drafted-and-hand-verified items; the content effort dwarfs the code, and no decision has been taken on commissioning it.
- **Any AI at all.** Unchanged from v1.
- Everything else on the v1 OUT list.

**Still owed from v1** *(privacy, terms and contact delivered 2026-08-03)*: real-OTP login verification on a physical phone, and a signing keystore for a release APK.

The privacy policy and terms are good-faith plain-language drafts written against the actual schema rather than from a template. **Legal review remains an open pre-launch item**, and the contact address is the builder's personal one until a dedicated support address exists. Both live in `CONTACT_EMAIL` (`src/lib/contact.ts`) so replacing it is a one-line change.

## Revision queue discipline

The queue is built from **the student's own `error_cause` tags**, never from ASHA's inference. When they marked a question `conceptual`, they said it was a concept gap; the queue only remembers that and brings it back. So a topic entering the queue is a *fact about what they told us*, not a claim about their ability — which is why it needs no evidence threshold, exactly as `lib/analytics/facts.ts` needs none.

That distinction is load-bearing. "Revise Time & Work" derived from one self-tagged concept error is honest. "You are weak at Time & Work" derived from the same single error would not be, and must never be the wording.

- **Promotion and demotion come from real mock performance, not a self-quiz.** Marking a topic revised advances its box. A later conceptual error in that same type sends it back to box 1. That is stronger evidence than a self-administered test, and it is data ASHA already has.
- **Never show an infinite backlog.** The queue is capped per day, and what does not fit is deferred rather than displayed. A queue of forty topics is a queue nobody opens.
- **`revision_queue` remains keyed on `question_type_id`, not `question_id`.** It schedules topics, not questions. Do not repurpose it for flashcards without reopening the content and copyright questions.

## Design system

The UI is built from the Claude Design handoff bundle (`CAT exam prep mobile app-handoff.zip` → `Asha Mobile.dc.html`, 14 screens across 2 turns). **Match the mockup's visual output; do not copy its prototype internals.**

- **Type:** Instrument Sans for prose and UI, IBM Plex Mono for every number, label, code and stat. The mono/sans split is load-bearing — it is what makes the app read as an instrument rather than a dashboard. Self-host both, so the app never depends on Google Fonts at runtime.
- **Palette:** ink `#12151A`, paper `#F4F1EA`, canvas `#E8E4DC`, brass accent `#B8863B`, cleared/good `#2E7D5B` (light `#6BA88A`), warning `#D9922E`, bad `#C0483C` (light `#E08A7E`), muted greys `#8A8578` / `#6B6659` / `#A09B8E` / `#A9A497`.
- **Structural motifs:** dark ink header over a paper sheet with a 26px top radius; the global confidence chip lives in the header so individual cards stay clean; a **dashed-border locked card** is the honest-scarcity primitive and gets built once, then reused everywhere.
- Bottom navigation is four tabs: HOME / PLAYBOOK / TRENDS / LOG.

## Naming and taxonomy discipline

The question-type taxonomy is **data, not code**. It lives in `question_types` as a self-referencing tree, seeded by script, hand-verified before seeding. Adding an exam means adding seed rows. If you find yourself writing an `if (exam === 'CAT')` branch in analytics code, stop — that condition belongs in `exam_configs` or the taxonomy.

Set archetypes (DILR) live in the same tree, distinguished by `kind = 'set_archetype'`, so they roll up through the same aggregation code as question types.

**Do not increase archetype granularity without recomputing threshold reachability.** A student sees roughly 5 sets per mock, so 12 mocks is about 60 sets. Across the 12 seeded archetypes that averages exactly the 5-set threshold — it is *only just* reachable. Splitting an archetype (e.g. Arrangements into linear / circular / matrix) would push most archetypes permanently below threshold and the playbook would render as locked cards forever. Use the seeded names in the UI even where a mockup shows a finer label.

## Analytics discipline

**Analytics must be pure functions over attempt rows.** Everything in `src/lib/analytics/` takes plain arrays in and returns plain objects out — no Supabase client, no React, no side effects. Three reasons: it is testable without a database, which is the only way the maths gets verified; the evidence thresholds are enforced in one place instead of sprinkled through components; and when the in-app timer arrives in v3 the analytics do not change at all, only the provenance label does.

- `src/lib/thresholds.ts` is the single source of truth for evidence thresholds. No component hardcodes a number.
- No analytic may branch on exam code. Marking, timing and structure come from `exam_configs` and `sections`.
- Insight recomputation runs on attempt completion over the user's full history, not incrementally — at a few dozen mocks per user a full recompute is cheap and it removes a whole class of stale-derived-state bug. **But recompute must carry `acted_on` and `dismissed` forward** by matching `(kind, target_type_id)`, or a dismissed insight reappears next mock and the v1→v2 gate metric silently resets.
- Analytics get unit tests **before** any insight UI exists.

## Content-generation discipline

Any seeded content — taxonomy nodes, archetype definitions, revision-source suggestions — follows Dhruva's rule: drafted, then independently verified against a real source before it is written to a seed script. Seed scripts are idempotent (upsert on a natural key), live in `scripts/`, and **assert their expected counts** rather than merely printing them, so a partial seed fails loudly. Weightage figures and archetype frequencies from coaching-site analyses are **directional, not exact**, and must be labelled as such wherever they surface in the UI.

## Workflow rules for every Claude Code session

1. **Plan first.** Use plan mode; propose the approach, wait for approval, then implement.
2. **One feature at a time.** Small diffs. Build → the builder tests on a real device → commit → next.
3. **Explain in plain English** what was built and how to test it, at the end of every change.
4. **Update documentation after EVERY iteration — mandatory, not optional.** Before the commit, update:
   - `docs/functional-spec.md` — anything a student would notice, in plain language, no implementation detail
   - `docs/architecture.md` — current stack, structure, any new component
   - `docs/data-model.md` — any schema change with a dated migration note; any new derived measure with its formula
   - `docs/changelog.md` — dated entry: what changed, why, how to test it *(starts at first deploy)*
   - `docs/decisions.md` — any non-obvious choice and the reason. Append-only, newest first.

   A feature is not "done" until the docs are updated. If docs and code disagree, fix the docs in the same commit. If a change would surprise someone reading only the docs, the docs are wrong.
5. **Never commit secrets.** `.env.local` is gitignored. The Supabase service-role key never reaches the browser and never enters git; seed scripts run locally only. Check before every commit.
6. **Write code a future hired developer can read:** clear names, comments on tricky logic, no premature abstraction. Scalability comes from boring Postgres + stateless routes, not cleverness.
7. **Testing minimum:** every feature manually tested at a 360px viewport and on the actual APK before it is called done. Analytics additionally covered by unit tests, including the below-threshold suppression cases. Seed scripts live in `scripts/` so a fresh database can be set up in one command.
8. **Migrations are additive and reversible.** Once a real user's data is live: no schema wipes, no test writes against production accounts.

## Security posture

- RLS on every table; no table ships without a policy.
- Shared reference tables (`exams`, `exam_configs`, `sections`, `question_types`) are read-for-authenticated with **no write policies at all** — writes happen only through service-role seed scripts, never from the app.
- Ownership on the attempt chain is inherited by join, not denormalised. `question_attempts` has no `user_id`; RLS reaches the owner through `section_attempts` → `mock_attempts` → `user_id`. A denormalised column would be a second source of truth waiting to disagree with the first.
- Any synthetic dev-mode test phone number must be blocked from authenticating via real production SMS — the Dhruva pattern, because a made-up-looking number cannot be confirmed unassigned in the real world.
- Android signing key and `keystore.properties` are gitignored and **must stay backed up** — a future Play Store listing is permanently tied to them.

## Current status

- **Phase 1 complete (2026-07-29).** Supabase project live; migrations `0001`–`0005` applied and verified by `supabase/verify.sql` (12 tables, RLS everywhere, no write policies on reference tables). CAT taxonomy seeded and asserted against the live database: **75 nodes = 56 question types + 12 set archetypes + 7 passage domains**, across 3 sections, 10 roots. Next.js scaffolded; `npm run build` and `npm run typecheck` clean.
- **Phases 2–6 complete (2026-07-30).** Phone-OTP auth and profile (2a/2b); the full logging loop — attempts list, attempt creation, DILR set sheet (1g), and VARC/QA question entry in both batch and card modes (1e/1f); the analytics layer with **45 passing tests** and no UI; and the insight screens — home (1a/1b), playbook (1c), trends and diagnostics (1h/1i/1j).
- **Verified end to end** against a live Supabase project at a 360px viewport, including the low-data state that is the point of the honest-data rule.
- **Account, export, delete and help shipped (2026-07-30).** `/account` merges design 2d's refusals with the export/delete controls; `/help` renders its threshold table from `lib/thresholds.ts` so it cannot drift from the code. Export is client-side under RLS (JSON + CSV); delete removes the auth identity via the one admin-client route and was verified on a throwaway account.
- **Not yet built:** persisting computed claims to the `insights` table with `acted_on` carry-forward; the PWA layer and Apple meta tags; the Capacitor Android build; a real privacy policy and support address behind the `/account` footer links.
- **Dev tooling:** `npm test` (node --test, runs TypeScript natively), `scripts/check-analytics.ts` (runs every analytic against the live database), `scripts/seed-dev-attempts.mjs --phone N [--delete]` (8 deterministic `[SYNTH]` mocks so thresholds can be crossed).
- Owner: solo builder (coding novice) + Claude Code.
- Open items carried deliberately: the IP opinion on private mock upload; **legal review of the privacy policy and terms text**; a dedicated support address to replace the personal one; real-OTP verification on a physical phone; a signing keystore for a release APK.

## Amendment log

- **2026-08-01** — **v1 → v2 gate overridden, unmet**, by explicit builder decision. v2 opened for the spaced revision queue only. OCR, micro-quizzes and AI stay out. Reasoning in `docs/decisions.md`.

- **2026-07-29** — Renamed *Sextant* → **ASHA**, to match the design handoff.
- **2026-07-29** — Web + Android APK moved from v3 into v1 scope, via Capacitor in remote-URL mode, mirroring Dhruva. Reasoning in `docs/decisions.md`.
- **2026-07-29** — iPhone covered by an installable PWA; **native iOS app not built in v1.** Same reasoning entry.
- **2026-07-29** — Two selectable question-entry modes; passage-domain tag (`0005`); the derived-measures rule; the marks-from-config rule; the archetype-granularity rule; the recompute-preserves-flags rule.
