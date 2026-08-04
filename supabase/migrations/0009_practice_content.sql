-- 0009_practice_content.sql
-- The practice-content layer: questions ASHA can put on screen, and the papers
-- that assemble them.
--
-- WHY PROVENANCE IS IN THE FIRST MIGRATION AND NOT A LATER ONE
--
-- CLAUDE.md's hard rule is that ASHA never ships an unlicensed shared bank of
-- exam questions. Indian courts treat exam papers as copyrighted literary works
-- (ICAI v. Shaunak H. Satya, (2011) 8 SCC 781), and the intended long-term model
-- is licensing content FROM coaching institutes rather than copying it. A schema
-- that can hold a question without recording who owns it is a schema that invites
-- exactly the mistake that would destroy that negotiation.
--
-- So `content_sources` is not an optional join. Every stimulus, item and paper
-- carries a source, and the source carries its licence terms. There is no way to
-- insert content anonymously.
--
-- THREE KINDS OF SOURCE
--
--   'original' — written for ASHA. Hand-drafted or agent-drafted and hand-verified
--                over public-domain material. Freely usable; this is what ships.
--   'licensed' — a third party's content used under an agreement, with attribution
--                and an expiry date. Nothing renders it without naming the owner.
--   'private'  — RESERVED, and deliberately not writable yet. Intended for a single
--                student's own material, visible to nobody else. CLAUDE.md flags
--                whether that is defensible fair dealing as an OPEN LEGAL QUESTION
--                needing an IP opinion, so this migration defines the shape and the
--                read policy but grants NO write path. The read policies below
--                already exclude other users' private rows, so enabling it later is
--                an added insert policy, not a security retrofit.
--
-- Marking is NOT stored on an item. Marks come from `exam_configs` at grading time,
-- because CLAUDE.md rule 7 forbids a hardcoded arithmetic constant even when it
-- happens to be right today.

-- ─── Sources ─────────────────────────────────────────────────────────────────

create table if not exists public.content_sources (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,      -- 'ASHA.ORIGINAL.V1'
  name                 text not null,             -- 'ASHA original set 1'
  kind                 text not null check (kind in ('original', 'licensed', 'private')),

  -- Who owns the copyright. Required for licensed content — the whole point of the
  -- table is that this can never be unknown.
  owner_name           text,
  licence_note         text,                      -- terms in plain language
  licence_expires_on   date,                      -- null = perpetual or n/a
  attribution_required boolean not null default false,

  -- Set only for kind = 'private'; the single user who may see it.
  owner_user_id        uuid references public.users (id) on delete cascade,

  active               boolean not null default true,
  created_at           timestamptz not null default now(),

  -- Licensed content must name its owner, or attribution is impossible.
  constraint content_sources_licensed_has_owner check (
    kind <> 'licensed' or (owner_name is not null and length(trim(owner_name)) > 0)
  ),
  -- A private source belongs to exactly one user; nothing else may carry a user.
  constraint content_sources_private_has_user check (
    (kind = 'private') = (owner_user_id is not null)
  )
);

-- ─── Shared stimulus: an RC passage, or a DILR set's data ─────────────────────
-- One table rather than two. A VARC passage and a DILR set are the same shape from
-- the delivery engine's side: a block of material several questions hang off.

create table if not exists public.question_stimuli (
  id                 uuid primary key default gen_random_uuid(),
  source_id          uuid not null references public.content_sources (id) on delete cascade,
  exam_id            uuid not null references public.exams (id),
  section_id         uuid not null references public.sections (id),
  kind               text not null check (kind in ('passage', 'set_data')),
  title              text,
  body               text not null,
  -- Taxonomy tags, both optional and both pointing at the same tree as everywhere
  -- else. Which one applies depends on `kind`.
  passage_domain_id  uuid references public.question_types (id),  -- kind = 'passage_domain'
  archetype_id       uuid references public.question_types (id),  -- kind = 'set_archetype'
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ─── The questions themselves ────────────────────────────────────────────────

create table if not exists public.question_items (
  id                 uuid primary key default gen_random_uuid(),
  source_id          uuid not null references public.content_sources (id) on delete cascade,
  exam_id            uuid not null references public.exams (id),
  section_id         uuid not null references public.sections (id),
  stimulus_id        uuid references public.question_stimuli (id) on delete cascade,
  question_type_id   uuid references public.question_types (id),   -- kind = 'question_type'
  passage_domain_id  uuid references public.question_types (id),   -- kind = 'passage_domain'

  stem               text not null,
  response_format    text not null default 'mcq'
                     check (response_format in ('mcq', 'tita')),
  -- MCQ options as an ordered json array of strings. `correct_option` is 1-based to
  -- match how a paper labels them, so an off-by-one is visible rather than silent.
  options            jsonb,
  correct_option     smallint,
  -- TITA answers are compared as normalised text, not floats: '0.5' and '.5' are the
  -- same answer, but rounding a currency answer to a float is how a correct response
  -- gets marked wrong.
  correct_answer     text,

  solution           text,
  difficulty         text check (difficulty in ('easy', 'moderate', 'hard')),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),

  -- An item that cannot be graded must not exist. These two constraints are the
  -- reason a half-entered question fails loudly at insert instead of silently
  -- marking a student wrong later.
  constraint question_items_mcq_shape check (
    response_format <> 'mcq' or (
      options is not null
      and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 6
      and correct_option is not null
      and correct_option between 1 and jsonb_array_length(options)
    )
  ),
  constraint question_items_tita_shape check (
    response_format <> 'tita' or (
      correct_answer is not null
      and length(trim(correct_answer)) > 0
      and options is null
      and correct_option is null
    )
  )
);

-- ─── Papers: an assembled practice test ──────────────────────────────────────

create table if not exists public.practice_papers (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.content_sources (id) on delete cascade,
  exam_id       uuid not null references public.exams (id),
  code          text not null unique,             -- 'ASHA.PRACTICE.QA.01'
  title         text not null,                    -- 'ASHA Practice QA 1'
  description   text,
  -- False for a single-section practice set, true for a full-length mock. A partial
  -- paper is the normal case and must not pretend to be a whole mock.
  is_full_mock  boolean not null default false,

  -- The paper's own clock, in minutes. NULL means "use the section's limit", which
  -- is right only for a full-length paper. A 12-question practice set handed CAT's
  -- full 40-minute QA clock would train exactly the wrong pacing, so a partial
  -- paper declares its own time rather than inheriting one that does not fit.
  time_limit_min int check (time_limit_min is null or time_limit_min > 0),

  active        boolean not null default false,    -- opt in explicitly, like exams
  created_at    timestamptz not null default now(),

  -- A partial paper must say how long it takes; only a full mock may fall back to
  -- the section clock.
  constraint practice_papers_partial_has_time check (
    is_full_mock or time_limit_min is not null
  )
);

create table if not exists public.paper_items (
  id                uuid primary key default gen_random_uuid(),
  paper_id          uuid not null references public.practice_papers (id) on delete cascade,
  question_item_id  uuid not null references public.question_items (id) on delete cascade,
  section_id        uuid not null references public.sections (id),
  question_number   int not null,
  created_at        timestamptz not null default now(),
  -- Two numbers cannot collide, and one item cannot appear twice on a paper.
  unique (paper_id, section_id, question_number),
  unique (paper_id, question_item_id)
);

-- ─── Linking an attempt to a paper taken inside ASHA ─────────────────────────
-- Additive and nullable: every existing attempt was logged post-hoc against a mock
-- taken elsewhere, and stays valid with paper_id null.

alter table public.mock_attempts
  add column if not exists paper_id uuid references public.practice_papers (id) on delete set null;

-- `entry_mode` needs a third value. The existing 'timed_in_app' means "ASHA ran the
-- clock while the student worked through their own paper" — ASHA held no questions.
-- Taking a paper inside ASHA is a different provenance and must be distinguishable,
-- because only the second kind has a machine-graded answer key behind it.
--
-- The old check was declared inline on the column in 0003, so Postgres named it
-- automatically. Rather than assume that name is `mock_attempts_entry_mode_check`,
-- this looks it up. Guessing wrong would be the worst kind of failure available
-- here: `drop constraint if exists` would silently match nothing, the new
-- constraint would be added alongside the old one, and the OLD one would go on
-- rejecting 'in_app_test' — a migration that reports success and blocks the
-- feature it exists to enable.
do $$
declare
  existing_name text;
begin
  select con.conname into existing_name
  from pg_constraint con
  join pg_class rel      on rel.oid = con.conrelid
  join pg_namespace nsp  on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'mock_attempts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%entry_mode%'
  limit 1;

  if existing_name is not null then
    execute format('alter table public.mock_attempts drop constraint %I', existing_name);
  end if;
end $$;

alter table public.mock_attempts
  add constraint mock_attempts_entry_mode_check
  check (entry_mode in ('post_hoc_log', 'timed_in_app', 'in_app_test'));

-- What the student actually answered. Nullable throughout: a post-hoc logged
-- question has no item behind it and no recorded response, only an outcome.
alter table public.question_attempts
  add column if not exists question_item_id uuid references public.question_items (id) on delete set null;
alter table public.question_attempts
  add column if not exists selected_option smallint;   -- 1-based, mcq only
alter table public.question_attempts
  add column if not exists response_text text;         -- tita only

create index if not exists question_stimuli_section_idx  on public.question_stimuli (section_id);
create index if not exists question_items_section_idx    on public.question_items (section_id);
create index if not exists question_items_stimulus_idx   on public.question_items (stimulus_id);
create index if not exists question_items_source_idx     on public.question_items (source_id);
create index if not exists paper_items_paper_idx         on public.paper_items (paper_id, section_id, question_number);
create index if not exists question_attempts_item_idx    on public.question_attempts (question_item_id);
create index if not exists mock_attempts_paper_idx       on public.mock_attempts (paper_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Content is readable when its source is readable, and a source is readable when it
-- is NOT private, or is private and belongs to the caller. Writes happen only
-- through service-role seed scripts: there are no insert/update/delete policies on
-- any of these tables, exactly as for the other shared reference tables.
--
-- The private branch is written now, while nothing can create private rows, so that
-- turning that feature on later adds an insert policy rather than rewriting the read
-- path — which is the version of this change that leaks one student's material to
-- another.

alter table public.content_sources  enable row level security;
alter table public.question_stimuli enable row level security;
alter table public.question_items   enable row level security;
alter table public.practice_papers  enable row level security;
alter table public.paper_items      enable row level security;

create policy content_sources_read on public.content_sources
  for select to authenticated
  using (kind <> 'private' or owner_user_id = auth.uid());

create policy question_stimuli_read on public.question_stimuli
  for select to authenticated
  using (exists (
    select 1 from public.content_sources cs
    where cs.id = question_stimuli.source_id
      and (cs.kind <> 'private' or cs.owner_user_id = auth.uid())));

create policy question_items_read on public.question_items
  for select to authenticated
  using (exists (
    select 1 from public.content_sources cs
    where cs.id = question_items.source_id
      and (cs.kind <> 'private' or cs.owner_user_id = auth.uid())));

create policy practice_papers_read on public.practice_papers
  for select to authenticated
  using (exists (
    select 1 from public.content_sources cs
    where cs.id = practice_papers.source_id
      and (cs.kind <> 'private' or cs.owner_user_id = auth.uid())));

create policy paper_items_read on public.paper_items
  for select to authenticated
  using (exists (
    select 1 from public.practice_papers p
    join public.content_sources cs on cs.id = p.source_id
    where p.id = paper_items.paper_id
      and (cs.kind <> 'private' or cs.owner_user_id = auth.uid())));
