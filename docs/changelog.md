# Changelog

Dated history, newest first. Every iteration adds an entry: what changed, why, and how to test it (CLAUDE.md, workflow rule 4).

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

**NOT verified — everything past OTP entry**
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
