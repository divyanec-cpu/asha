-- 0003_attempts.sql
-- The attempt hierarchy — the product's core asset.
--   mock_attempts → section_attempts → set_attempts (DILR only) → question_attempts
-- Every table owner-only RLS.

-- Where the mock came from. No file_path column in v1: uploads are blocked pending
-- the IP opinion (see CLAUDE.md). This table is metadata only — the student names
-- the mock so they can recognise it later.
create table if not exists public.mock_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  provider   text not null,                     -- 'SimCAT', 'AIMCAT', 'iCAT', 'PYQ', 'Other'
  title      text not null,                     -- 'SimCAT 07', 'CAT 2023 Slot 2'
  is_official_pyq boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mock_attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  exam_id            uuid not null references public.exams (id),
  exam_config_id     uuid references public.exam_configs (id),
  source_id          uuid references public.mock_sources (id) on delete set null,
  taken_on           date not null,
  logged_at          timestamptz not null default now(),

  -- HONEST-DATA RULE. Every analysis that uses timing must surface this.
  --   measured  = Sextant's own timer captured it (v3 in-app mode)
  --   estimated = the student recalled it in buckets during review entry (v1 default)
  --   absent    = no timing data at all; time analytics are suppressed for this attempt
  timing_source      text not null default 'estimated'
                     check (timing_source in ('measured', 'estimated', 'absent')),

  entry_mode         text not null default 'post_hoc_log'
                     check (entry_mode in ('post_hoc_log', 'timed_in_app')),

  total_score        numeric(6,2),
  percentile_reported numeric(5,2),              -- what the mock platform told them; never computed here
  notes              text,
  is_complete        boolean not null default false,  -- review entry can be resumed
  unique (user_id, source_id, taken_on)
);

create table if not exists public.section_attempts (
  id               uuid primary key default gen_random_uuid(),
  mock_attempt_id  uuid not null references public.mock_attempts (id) on delete cascade,
  section_id       uuid not null references public.sections (id),
  score            numeric(6,2),
  time_used_sec    int,
  num_attempted    int,
  num_correct      int,
  num_incorrect    int,
  num_skipped      int,
  -- Borrowed from the GMAT score report: pacing across four equal quarters of the
  -- section clock, which separates "ran out of time" from "collapsed at the end".
  quarter_marks    jsonb,                       -- [q1, q2, q3, q4] marks earned per quarter
  created_at       timestamptz not null default now(),
  unique (mock_attempt_id, section_id)
);

-- THE SIGNATURE TABLE. A DILR set is a unit above the question, and — critically —
-- a row exists for EVERY set on the paper, including the ones the student never
-- touched. Skipped sets with chosen = false are what make skip-regret computable.
create table if not exists public.set_attempts (
  id                  uuid primary key default gen_random_uuid(),
  section_attempt_id  uuid not null references public.section_attempts (id) on delete cascade,
  archetype_id        uuid references public.question_types (id),  -- kind = 'set_archetype'
  label               text,                     -- 'Set 3' — how it appeared on the paper
  num_questions       int not null,
  variable_count      int,                      -- 3-variable vs 4-variable matrix logic
  chosen              boolean not null default false,
  selection_order     int,                      -- 1 = attempted first; null if never chosen
  time_spent_sec      int not null default 0,   -- includes time spent scanning then abandoning
  marks_earned        numeric(6,2) not null default 0,
  -- Filled during review, once the student knows the answers. This is the raw material
  -- of the set-selection playbook.
  solvable_verdict    text check (solvable_verdict in
                        ('cleared', 'attempted_failed', 'skipped_would_have_cleared',
                         'skipped_correctly', 'abandoned_midway')),
  created_at          timestamptz not null default now()
);

create table if not exists public.question_attempts (
  id                  uuid primary key default gen_random_uuid(),
  section_attempt_id  uuid not null references public.section_attempts (id) on delete cascade,
  set_attempt_id      uuid references public.set_attempts (id) on delete cascade,  -- null outside DILR
  question_type_id    uuid references public.question_types (id),
  question_number     int,                      -- as numbered on the paper
  response_format     text not null default 'mcq' check (response_format in ('mcq', 'tita')),
  order_index         int,                      -- the order the STUDENT hit it, not paper order
  time_spent_sec      int,
  status              text not null check (status in ('attempted', 'skipped', 'revisited')),
  is_correct          boolean,                  -- null when skipped
  confidence          smallint check (confidence between 1 and 3),  -- declared before checking
  -- The four-way root cause. This single tag is what makes recommendations actionable
  -- and is the thing no incumbent does.
  error_cause         text check (error_cause in
                        ('conceptual', 'misread', 'silly', 'time', 'none')),
  marks_earned        numeric(4,2),
  created_at          timestamptz not null default now()
);

create index if not exists question_attempts_section_idx on public.question_attempts (section_attempt_id);
create index if not exists question_attempts_type_idx    on public.question_attempts (question_type_id);
create index if not exists set_attempts_section_idx      on public.set_attempts (section_attempt_id);
create index if not exists mock_attempts_user_date_idx   on public.mock_attempts (user_id, taken_on desc);

alter table public.mock_sources      enable row level security;
alter table public.mock_attempts     enable row level security;
alter table public.section_attempts  enable row level security;
alter table public.set_attempts      enable row level security;
alter table public.question_attempts enable row level security;

-- Direct ownership
create policy mock_sources_own on public.mock_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mock_attempts_own on public.mock_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ownership inherited through the chain
create policy section_attempts_own on public.section_attempts
  for all using (exists (
    select 1 from public.mock_attempts m
    where m.id = section_attempts.mock_attempt_id and m.user_id = auth.uid()))
  with check (exists (
    select 1 from public.mock_attempts m
    where m.id = section_attempts.mock_attempt_id and m.user_id = auth.uid()));

create policy set_attempts_own on public.set_attempts
  for all using (exists (
    select 1 from public.section_attempts s
    join public.mock_attempts m on m.id = s.mock_attempt_id
    where s.id = set_attempts.section_attempt_id and m.user_id = auth.uid()))
  with check (exists (
    select 1 from public.section_attempts s
    join public.mock_attempts m on m.id = s.mock_attempt_id
    where s.id = set_attempts.section_attempt_id and m.user_id = auth.uid()));

create policy question_attempts_own on public.question_attempts
  for all using (exists (
    select 1 from public.section_attempts s
    join public.mock_attempts m on m.id = s.mock_attempt_id
    where s.id = question_attempts.section_attempt_id and m.user_id = auth.uid()))
  with check (exists (
    select 1 from public.section_attempts s
    join public.mock_attempts m on m.id = s.mock_attempt_id
    where s.id = question_attempts.section_attempt_id and m.user_id = auth.uid()));
