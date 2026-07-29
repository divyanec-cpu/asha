-- 0006_set_tally.sql
-- Records how many questions in a DILR set the student answered, and how many
-- they got right.
--
-- WHY: `set_attempts.marks_earned` already existed, but nothing stored the
-- counts it is derived from. Keeping only the derivation and discarding the
-- observation is the pattern this project's data discipline warns against, and
-- it has two concrete costs:
--
--   1. Marks become un-recomputable. `exam_configs` is versioned by year
--      precisely so a marking or pattern change is a data edit — but a stored
--      marks_earned cannot be revised from a corrected config without the raw
--      counts.
--   2. It hides a real distinction. "Attempted 4 of 4, got 4 right" and
--      "attempted 1 of 4, got 1 right" can produce similar marks and mean
--      completely different things about set selection.
--
-- Both nullable: sets the student never opened have no tally, and neither do
-- rows created before this migration.
--
-- Additive and reversible. Rollback at the foot of the file.

alter table public.set_attempts
  add column if not exists num_attempted int,
  add column if not exists num_correct   int;

comment on column public.set_attempts.num_attempted is
  'Questions in this set the student answered. Null for sets never opened.';
comment on column public.set_attempts.num_correct is
  'How many of num_attempted were correct. Null for sets never opened.';

-- Sanity constraints. Named so a violation is legible in an error message.
-- NOT VALID would let existing bad rows through; there are none yet, so validate
-- immediately.
alter table public.set_attempts
  drop constraint if exists set_attempts_tally_bounds;

alter table public.set_attempts
  add constraint set_attempts_tally_bounds check (
    (num_attempted is null or (num_attempted >= 0 and num_attempted <= num_questions))
    and (num_correct is null or num_correct >= 0)
    and (num_correct is null or num_attempted is null or num_correct <= num_attempted)
  );

-- RLS needs no change: set_attempts already has an owner-only policy covering
-- all operations, inherited by join through section_attempts → mock_attempts.

-- ─── Rollback ───────────────────────────────────────────────────────────────
--   alter table public.set_attempts
--     drop constraint if exists set_attempts_tally_bounds;
--   alter table public.set_attempts drop column if exists num_correct;
--   alter table public.set_attempts drop column if exists num_attempted;
