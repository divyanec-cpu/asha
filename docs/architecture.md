# Architecture

Status: **database live and seeded; app scaffolded.** Migrations `0001`–`0005` applied and verified, CAT taxonomy seeded (75 nodes), Next.js scaffolded with the design tokens and `lib/thresholds.ts` in place. No feature code yet — auth is Phase 2. The rest of this document describes the intended build.

## Stack

Deliberately identical to Dhruva, so nothing is re-learned and the known-good patterns carry over:

- **Frontend:** Next.js (App Router), React, Tailwind, TypeScript. Mobile-first: design at 390px (the handoff frame), test at 360px (the cheapest real Android). PWA-enabled — manifest + service worker.
- **Backend / DB / Auth:** Supabase — Postgres + Auth, RLS on every table without exception.
- **Auth:** phone + OTP via MSG91's widget in production, deterministic dev code on localhost (hCaptcha inside the widget refuses to run on localhost — a Dhruva finding, not a guess). Adults only, so no invite or consent flow: a new number goes straight to profile setup.
- **Hosting:** Vercel, auto-deploy from `main` on a private GitHub repo.
- **AI:** none in v1. The app must work end to end with zero model calls.
- **Mobile:** web + **Android APK** via Capacitor in remote-URL mode (the Dhruva pattern) + **an installable PWA that covers iPhone**. One codebase, three ways in *(scope amendment 2026-07-29, see `decisions.md`)*.

### How the Android app works — read this before touching `capacitor.config.ts`

The Android app is a **thin shell**, not a second build of the UI. `capacitor.config.ts` sets `server.url` to the Vercel deployment and `webDir` to a placeholder directory that is never actually served (Capacitor demands one even in remote-URL mode). The WebView loads the deployed site.

What follows from that, and it is the whole reason for the choice:

- **One deploy updates everything.** A push to `main` changes the web app and the APK simultaneously — no reinstall, no store review for a feature change.
- **There is no second UI, no second auth flow, no separate release train.** Anything built for the web is on Android the moment it deploys.
- **It needs a network connection.** Accepted: there is nothing useful to do offline with no data.
- **Do not add `output: 'export'`.** A static export would break the server-side MSG91 token verification, and it isn't how Dhruva does it.

### iPhone: PWA, not a native app

Because the APK is only a WebView over the deployed URL, an iPhone user who opens that URL in Safari and taps **Add to Home Screen** gets the same application — icon, fullscreen, no browser chrome. No `ios/` platform, no Xcode, no Mac, no Apple Developer membership, no App Store review.

The work this *does* require, because **iOS ignores most of `manifest.json`**:

- `apple-mobile-web-app-capable` — without it, Add to Home Screen yields a Safari bookmark rather than a fullscreen app.
- `apple-mobile-web-app-status-bar-style` matching the ink header (`#12151A`), or a white band appears above it.
- `apple-touch-icon` at the required sizes — iOS does not read the manifest's `icons` array — plus `apple-touch-startup-image`.
- An **Add to Home Screen prompt for iOS Safari visitors.** It's a share-sheet action most users have never used; without a nudge they keep a browser tab instead of an app.

A native iOS build is revisited only against a concrete reason (App Store discoverability, or a capability the web can't reach) — see `decisions.md` for the Guideline 4.2 problem it would inherit.

## Repository layout (planned)

```
asha/
  CLAUDE.md                     project brief + rules — read first
  docs/
    architecture.md             this file
    data-model.md               every table, live vs reserved
    decisions.md                why non-obvious choices were made
    functional-spec.md          what it does, in plain language
    changelog.md                dated history (starts at first deploy)
  supabase/
    migrations/                 applied by pasting into the SQL Editor, in order
      0001_core.sql             users + phone lookup fn
      0002_taxonomy.sql         exams, exam_configs, sections, question_types
      0003_attempts.sql         mock/section/set/question attempt chain
      0004_insights.sql         insights + reserved revision_queue
      0005_passage_domain.sql   passage_domain kind + tag on question_attempts
    verify.sql                  read-only PASS/FAIL check that 0001–0005 applied
  scripts/
    seed-cat-taxonomy.mjs       75 CAT nodes, service-role, idempotent, asserts counts
  .env.local.example            environment template; .env.local is gitignored
  src/
    app/
      page.tsx                  session → profile redirect, else auth flow
      log/                      THE CORE LOOP — mock review entry
        [attemptId]/            resumable section-by-section entry
      playbook/                 set-selection order + skip regret     (nav tab 2)
      trends/                   cross-mock trend, quadrant, diagnostics (nav tab 3)
      account/                  profile, export, delete
      help/                     short answers; "why is this locked?"
      about/                    the refusals, stated plainly; export + delete live here too
    lib/
      analytics/                pure functions over attempt rows — no DB, no React
      thresholds.ts             evidence thresholds, single source of truth
      derived.ts                published formulas for every on-screen derived number
      supabase/                 browser + server clients
  capacitor.config.ts           remote-URL shell config — see above
  www/                          never-served placeholder Capacitor requires
  android/                      generated; holds the release keystore (gitignored)
  public/
    manifest.json               PWA manifest (Android/desktop install)
    icons/                      incl. apple-touch-icon sizes iOS reads instead
```

No `ios/` directory: iPhone is served by the PWA, not a native build.

Route names follow the four-tab bottom navigation in the design (HOME / PLAYBOOK / TRENDS / LOG) rather than the earlier `insights/` + `history/` split. The quadrant and the pacing/calibration/error-cause diagnostics live under `trends/` — adding a fifth tab for them was rejected as clutter.

## The one architectural rule that matters

**Analytics must be pure functions over attempt rows.** Everything in `lib/analytics/` takes plain arrays in and returns plain objects out — no Supabase client, no React, no side effects. Three reasons:

1. It is testable without a database, which is the only way the maths gets verified.
2. The evidence thresholds are enforced in one place rather than sprinkled through components.
3. When the in-app timer arrives in v3 and timing becomes `measured` rather than `estimated`, the analytics don't change at all — only the provenance label does.

Corollary: **no analytic may branch on exam code.** Marking, timing and structure come from `exam_configs` and `sections`. If a function needs to know it's CAT, the thing it actually needs is a config field that doesn't exist yet.

## Data flow

```
student takes a mock elsewhere
        ↓
  /log  →  mock_attempts (is_complete = false, resumable)
        ↓
  per section  →  section_attempts
        ↓                    ↓
  DILR: set_attempts    VARC/QA: question_attempts
  (all 5 sets, incl.         (type, time bucket,
   skipped, + verdict)        confidence, error cause)
        ↓
  mark complete  →  recompute insights for this user
        ↓
  insights (supporting_n + confidence_label mandatory)
        ↓
  /insights  →  only rows at or above threshold render
```

Insight recomputation runs on attempt completion, over that user's full history — not incrementally. At the scale in question (a few dozen mocks, a few thousand question rows per user) a full recompute is cheap, and it removes an entire class of stale-derived-state bug.

**Recompute must carry `acted_on` and `dismissed` forward** by matching `(kind, target_type_id)`. Because `insights` is unique on `(user_id, kind, target_type_id, generated_at)`, a recompute writes new rows — so without the carry-forward a dismissed insight silently reappears after the next mock and `acted_on`, the v1 → v2 gate metric, resets to false. Nothing errors; the gate just reads as never met. See `decisions.md`.

## Security posture

- RLS on every table; no table ships without a policy.
- Shared reference tables (`exams`, `exam_configs`, `sections`, `question_types`) are read-for-authenticated with **no write policies at all** — writes happen only through service-role seed scripts, never from the app.
- Ownership on the attempt chain is inherited by join rather than denormalised (see `decisions.md`).
- Service-role key never reaches the browser; seed scripts run locally or in CI only.
- Export and delete are first-class routes from day one, not a compliance afterthought.
- Synthetic dev-mode test phone numbers are blocked from authenticating via real production SMS — the Dhruva pattern, since a made-up-looking number can't be confirmed unassigned in the real world.
- The Android release keystore and `keystore.properties` are gitignored and must stay backed up; a future Play Store listing is permanently tied to them. Same for the iOS signing certificate and provisioning profile.

## Applying migrations

There is no Supabase CLI and no `psql` in this environment, and Dhruva has neither either — its thirteen migrations were applied by pasting each file into the Supabase dashboard's **SQL Editor**, in filename order. ASHA follows the same method: it is boring, it needs no tooling, and it works for a novice builder.

The cost of a manual paste is that skipping a file, or selecting only part of one before hitting Run, fails **silently** — the next migration usually still succeeds, and the gap surfaces much later as a missing table or, worse, a table with RLS off. `supabase/verify.sql` exists for exactly that: paste it after the five migrations and read the PASS/FAIL column. Do not run the seed script until every row passes.

## Next steps

1. Create the Supabase project; apply migrations `0001`–`0005` in order via the SQL Editor; run `supabase/verify.sql` and confirm every check PASSes.
2. Scaffold Next.js (matching Dhruva's major versions) — this installs `@supabase/supabase-js`, which the seed script needs.
3. Run `seed-cat-taxonomy.mjs`; it **asserts** its result against the live database (75 nodes, 3 sections, 56/12/7 by kind) and exits non-zero on a mismatch rather than merely printing counts.
4. Wire phone-OTP auth and the profile screen.
5. Build `/log` — the DILR set entry first, since it's the signature feature and the hardest flow to get frictionless.
6. Build `lib/analytics/` with tests before any insight UI exists. Write the *Derived measures* formulas into `data-model.md` as each one is implemented.
7. PWA layer: manifest, service worker, and the Apple-specific meta tags and icons — then verify Add to Home Screen on a real iPhone gives a fullscreen app with the dark status bar, not a bookmark.
8. Add Capacitor Android: signed APK, sideload test on a real phone.
