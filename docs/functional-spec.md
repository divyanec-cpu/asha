# Functional Description

What ASHA does, in plain language — no code, no schema. For "how it's built," see [architecture.md](architecture.md) and [data-model.md](data-model.md). For "why a choice was made," see [decisions.md](decisions.md).

## What ASHA is

A mock-test analytics companion for CAT aspirants. **ASHA does not teach and does not sell mocks.** The student's coaching institute and their existing mock series (SimCAT, AIMCAT, iCAT, Career Launcher, past papers) are where preparation happens. ASHA wraps around that: it reads the student's own attempt data across many mocks and tells them, with stated confidence, where they actually stand and what to change before the next one.

The instrument metaphor is the product rule. A sextant does not steer the ship — it takes a position fix. ASHA tells you where you are; the decisions stay yours.

Tagline: *"Take the mock. Find out where you stand."*

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

## Timing yourself (added 2026-08-03)

If you haven't taken the mock yet, ASHA can run the clock while you work through your own paper. It doesn't show you questions — it times you. Tap how sure you were on each one and it records your time and the order you actually worked in, then you fill in right and wrong later once you have the answer key.

The difference this makes: timings you *remember* are estimates, and ASHA labels them as such. Timings it *measures* are measured, and it says so. Nothing about the analysis changes — the label does.

Where the exam gives each section its own clock, ASHA counts down and stops itself at the limit, like the real thing. Where an exam gives you one total allowance to spread across sections however you like, there is nothing to count down to, so it counts up and stops when you do.

## GMAT and MAT (groundwork only, 2026-08-03)

ASHA now knows what a GMAT and a MAT paper look like — their sections, question counts, timing and marking rules, and the topics you'd tag against. **You still can't select either one.** They appear on the profile screen as unavailable.

This is deliberate, and the GMAT reason is worth stating: the GMAT is adaptive and scored on a 205–805 scale by an algorithm that weighs question difficulty. There is no such thing as "marks per question" on a GMAT. ASHA can count your correct answers honestly, but a count of correct answers is not a GMAT score, and no screen has yet been checked for wording that might blur the two. Rather than ship something that reads like a score prediction — which ASHA refuses to do for any exam — the groundwork is in place and the exams stay switched off.

## Practising inside ASHA (added 2026-08-04)

ASHA now has practice questions of its own. Open the LOG tab and tap **Practise in ASHA**: pick a paper, and ASHA shows you the questions, runs the clock, lets you move between questions in any order, and marks the whole thing the moment you submit. No answer key to check by hand, and your timings are measured rather than remembered.

Saying how sure you were is one optional tap per question. Only questions you tag count towards your calibration — so tag honestly or don't tag at all.

**Every question says where it came from.** ASHA's own questions are labelled as written by ASHA. If a question is ever licensed from a coaching institute, that institute is named on the card. ASHA does not carry copies of real CAT, SimCAT or AIMCAT papers, and it never will without a licence — those are somebody else's copyrighted work, and "it's on the internet" is not permission.

**A practice set is not a mock, and ASHA won't pretend otherwise.** A 14-question practice paper is marked out of 42; a real CAT mock is out of 204. Putting the two in the same trend line would produce a number that means nothing, so practice runs stay out of your mock count and out of your cross-mock trend. They're listed on the practice screen, with your score, whenever you want to look back at them.

What ASHA still won't do here: tell you *why* you got something wrong. It marks right and wrong, but concept-versus-misread-versus-careless-versus-ran-out-of-time is your own judgement, tagged afterwards. Guessing it for you would be the kind of overclaim the rest of the app is built to avoid.

## Deferred, on purpose

OCR of result screenshots; AI anything; XAT, NMAT, SNAP and CMAT; uploading your own mock papers. The schema anticipates most of these; the product does not ship them until the gates in CLAUDE.md are met.

## Current status

The database is live and the CAT taxonomy is loaded, so the app knows what a CAT paper looks like — three sections, 68 questions, and the 75 question types, set archetypes and passage domains a student will tag against. Nothing is usable yet: there is no way to sign in and nothing to look at. Signing in comes next, then the screen for logging a mock.
