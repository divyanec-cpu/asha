-- 0008_section_timing_source.sql
-- Moves timing provenance down to the section, and lets an attempt say "mixed".
--
-- WHY: in-app timed test mode (v3) makes `timing_source = 'measured'` real, but a
-- student will run ONE section against the clock and log the others from memory
-- afterwards — timing a 40-minute DILR section is a very different commitment
-- from timing all three.
--
-- `mock_attempts.timing_source` is a single column, so a part-timed attempt would
-- have to be recorded as either 'measured' or 'estimated', and both are false.
-- CLAUDE.md's honest-data rule says: "Never average measured and estimated
-- timings into one figure without saying so." A column that cannot express the
-- difference makes that rule unenforceable.
--
-- So: provenance per section, which is the level at which timing is actually
-- captured, plus 'mixed' on the attempt as an honest rollup.
--
-- Additive and reversible. Rollback at the foot of the file.

-- ─── 1. Provenance per section ──────────────────────────────────────────────
alter table public.section_attempts
  add column if not exists timing_source text not null default 'estimated'
    check (timing_source in ('measured', 'estimated', 'absent'));

comment on column public.section_attempts.timing_source is
  'How this section''s per-question timings were obtained. measured = ASHA''s own '
  'timer captured them (timed mode); estimated = the student recalled them in '
  'buckets during review; absent = no timing data. Defaults to estimated, which '
  'is correct for every row written before timed mode existed.';

-- Existing rows are all post-hoc recall, and the default already says so — no
-- backfill needed. Stated explicitly because "no UPDATE statement" is otherwise
-- indistinguishable from an oversight.

-- ─── 2. 'mixed' on the attempt ──────────────────────────────────────────────
-- Derived from the sections rather than set independently: 'measured' when every
-- section was timed, 'estimated' when none was, 'mixed' when some were. The
-- application computes it on section save; the constraint just has to permit it.
--
-- The original constraint was declared inline in 0003, so Postgres auto-named it.
-- Looked up dynamically rather than guessed, for the same reason as in 0007.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'mock_attempts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%timing_source%';

  if v_name is not null then
    execute format('alter table public.mock_attempts drop constraint %I', v_name);
  end if;
end $$;

alter table public.mock_attempts
  drop constraint if exists mock_attempts_timing_source_check;
alter table public.mock_attempts
  add constraint mock_attempts_timing_source_check
  check (timing_source in ('measured', 'estimated', 'absent', 'mixed'));

-- ─── 3. Order of attempt, finally populated ─────────────────────────────────
-- No new column — `question_attempts.order_index` has existed since 0003 and was
-- documented as "reserved in practice" because neither v1 entry flow could know
-- the order a student actually worked in. Timed mode observes it directly, so the
-- comment is corrected rather than the schema changed.
comment on column public.question_attempts.order_index is
  'The order the student actually attempted this question, 1-based. Populated by '
  'timed mode, which observes it. Null for post-hoc logging, where the paper order '
  'is all that is knowable — never inferred from anything else.';

-- RLS needs no change: both tables already carry owner-only policies covering all
-- operations, inherited by join.

-- ─── Rollback ───────────────────────────────────────────────────────────────
--   alter table public.mock_attempts
--     drop constraint if exists mock_attempts_timing_source_check;
--   alter table public.mock_attempts
--     add constraint mock_attempts_timing_source_check
--     check (timing_source in ('measured', 'estimated', 'absent'));
--   alter table public.section_attempts drop column if exists timing_source;
