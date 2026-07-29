# Functional Description

What ASHA does, in plain language — no code, no schema. For "how it's built," see [architecture.md](architecture.md) and [data-model.md](data-model.md). For "why a choice was made," see [decisions.md](decisions.md).

## What ASHA is

A mock-test analytics companion for CAT aspirants. **ASHA does not teach and does not sell mocks.** The student's coaching institute and their existing mock series (SimCAT, AIMCAT, iCAT, Career Launcher, past papers) are where preparation happens. ASHA wraps around that: it reads the student's own attempt data across many mocks and tells them, with stated confidence, where they actually stand and what to change before the next one.

The instrument metaphor is the product rule. A sextant does not steer the ship — it takes a position fix. ASHA tells you where you are; the decisions stay yours.

Tagline: *"You've taken the mock. Now find out where you stand."*

## Who uses it

Adults — working professionals and final-year students, typically 20–30, taking somewhere between 10 and 30 mocks across a season. Time-poor and already spending two hours or more analysing each mock by hand, usually in a spreadsheet they built themselves. No minors, so no parent accounts, no consent flow, no invite codes.

## Getting in

Phone number plus OTP, same as Dhruva — no passwords, no email. A new number goes straight to a short profile: name, target exam (CAT in v1), target year, optional target percentile, and how they're preparing (classroom / online / self-study). A returning number lands in the app.

## The core loop: logging a mock

This is the whole product, and its design constraint is brutal: **if logging takes 30 minutes, nobody does it twice.** The target is under ten minutes, folded into the review the student is already doing anyway.

The student takes a mock wherever they normally do. Afterwards, in ASHA, they create an attempt — naming the source ("SimCAT 07"), the date, their reported score and percentile — and then walk three sections.

**For VARC and QA**, each question is a single row: was it attempted, skipped, or returned to; was it right; how confident were they *before* checking; roughly how long did it take (entered as a bucket, not a stopwatch reading); and what type of question was it. For anything wrong or skipped, one more tap: **why** — a concept they don't have, something they misread, a careless slip, or simply time. On reading-comprehension questions they also tag the passage's subject, because being fine on business writing and lost in abstract philosophy is a different problem from being weak at inference.

They choose how to enter each section. **Card by card** walks every question and captures everything. **Batch** assumes the whole section was correct and asks them to tap only the exceptions — three taps instead of twenty-two on a section they aced — then collects the detail for those. The trade is stated where it bites: batch mode only records confidence on the questions they flagged, so the calibration reading takes longer to unlock, and the app says that rather than quietly filling the gap with an assumption.

**For DILR**, the unit is the set, not the question. The student logs **all five sets, including the ones they never touched.** For each: what shape was it (arrangement, games and tournaments, scatter plot, caselet…), how many questions, did they pick it, in what order, how long did they spend on it — and, once they've seen the answers, the verdict. Cleared it. Attempted and failed. Skipped it and would have cleared it. Skipped it correctly. Started it and abandoned it midway.

That last field is the one everything else is built on.

## What comes back

**The set-selection playbook** — the signature feature, and the thing no other product does. Over a dozen mocks, a student accumulates fifty-odd set attempts. ASHA ranks the archetypes by what they're actually worth to *this* student: clear rate, average time to clear, marks per minute. The output is a personal pick-and-skip order for exam day — "you clear Games & Tournaments in nine minutes at an 80% rate; you have never cleared a scatter-plot set and have burned 47 minutes trying." Alongside it sits **skip regret**: the sets they walked past that they'd have cleared, which tells them whether their scanning is too timid or about right.

**The accuracy-versus-time quadrant** — every question type placed on two axes. Fast and accurate is leverage: do more of it, first. Slow and accurate is an efficiency target. Fast and wrong is recklessness, usually misreads. Slow and wrong is either a concept gap or a trap they should learn to walk past. The four quadrants imply four different fixes, which is the point.

**Time traps** — questions where they spent far more than their own median for that type. Highlighted hardest where the answer was still wrong: time sunk for nothing.

**Pacing** — each section split into four equal quarters, showing where marks were actually earned. This separates a student who ran out of time from one who collapsed in the last ten minutes, which look identical on a score sheet and need opposite remedies.

**Calibration** — stated confidence against actual correctness. Confident-and-wrong means guessing into negative marking. Unconfident-and-right means leaving winnable marks on the table. Both are fixable, and neither is visible without the confidence tag.

**Error causes** — the four-way split, per section. "Six of your nine QA errors were misreads, not concept gaps" points at a reading discipline, not a revision plan. This distinction is what makes the recommendation actionable.

## Honesty about small samples

Every insight carries the number of observations behind it and a plain confidence label. **Below the evidence threshold, the insight is not shown at all** — instead the app says what's missing: "three more Games & Tournaments sets before this is reliable."

This is deliberate and it costs the product something. A newer user sees less. But a single confidently-wrong claim built on two data points destroys trust with exactly the analytical, sceptical user this is built for, and there is no recovering it. The thresholds are published in [data-model.md](data-model.md) rather than hidden.

Timing is labelled by provenance too. In v1 all timing is the student's own recollection, entered in buckets, and every view that uses it says so. Nothing pretends to a precision it doesn't have.

## What the student owns

Full export of everything ASHA holds, as a file. Full delete of the account and every attempt. Both work from day one.

## What ASHA deliberately does not do

- **Does not teach** — no lectures, no concept content, no original syllabus material.
- **Does not sell or ship mocks** — it never contains a shared bank of CAT questions. This is a legal position as much as a product one: Indian courts treat exam papers as copyrighted literary works, and GMAC actively enforces against reproduction of GMAT items.
- **Does not compute or predict percentile** — percentile is a number the student reports from their mock platform. ASHA will not imply it can rank them.
- **Does not show leaderboards, ranks, or peer comparison.** Every number is the student's own.
- **Does not accept file uploads in v1** — blocked pending a written IP opinion on whether private upload of purchased material for personal analytics is defensible. The MVP needs no upload.
- **Does not use AI in v1.** The app is fully functional with zero AI calls.

## Where you can use it

One app, three ways in. ASHA runs in any browser; Android users can install it as a proper app; iPhone users add it to their home screen from Safari, which gives them the same icon and the same fullscreen app. All three are the same deployment, so a new feature appears everywhere at once and nothing ever needs reinstalling.

The phone versions are the point, not a bonus: a working professional logging a mock in the evening isn't reliably sitting at a laptop, and an icon on the home screen is the difference between a habit and a bookmark.

There's no ASHA in the App Store, and for now that's deliberate rather than a gap — the home-screen version already does everything the Android app does.

## Deferred, on purpose

In-app timed test mode; GMAT and MAT support; flashcards and spaced revision; OCR of result screenshots; AI anything; XAT, NMAT, SNAP and CMAT. The schema anticipates most of these; the product does not ship them until the gates in CLAUDE.md are met.

## Current status

The database is live and the CAT taxonomy is loaded, so the app knows what a CAT paper looks like — three sections, 68 questions, and the 75 question types, set archetypes and passage domains a student will tag against. Nothing is usable yet: there is no way to sign in and nothing to look at. Signing in comes next, then the screen for logging a mock.
