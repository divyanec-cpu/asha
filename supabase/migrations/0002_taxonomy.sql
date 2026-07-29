-- 0002_taxonomy.sql
-- Shared reference data. Read-only to authenticated users; written only by seed scripts
-- running as service role. This is the configuration layer that lets one schema serve
-- CAT, GMAT and MAT without forking analytics code (see CLAUDE.md).

create table if not exists public.exams (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,              -- 'CAT', 'GMAT', 'MAT'
  name       text not null,
  adaptive   boolean not null default false,
  active     boolean not null default false,    -- only CAT is true in v1
  created_at timestamptz not null default now()
);

-- Marking and timing parameters, versioned by year so a mid-cycle pattern change
-- is a data edit rather than a code change.
create table if not exists public.exam_configs (
  id                    uuid primary key default gen_random_uuid(),
  exam_id               uuid not null references public.exams (id) on delete cascade,
  effective_year        int  not null,
  total_questions       int  not null,
  total_time_min        int  not null,
  mark_correct          numeric(4,2) not null,
  mark_wrong_mcq        numeric(4,2) not null,   -- negative, e.g. -1.00 for CAT
  mark_wrong_numeric    numeric(4,2) not null,   -- CAT: 0 (no penalty on TITA)
  section_order_fixed   boolean not null default true,
  review_edit_limit     int,                     -- GMAT: 3 per section; null = not applicable
  unattempted_penalty   jsonb,                   -- XAT-style rules; null for CAT/GMAT/MAT
  notes                 text,
  created_at            timestamptz not null default now(),
  unique (exam_id, effective_year)
);

create table if not exists public.sections (
  id                     uuid primary key default gen_random_uuid(),
  exam_id                uuid not null references public.exams (id) on delete cascade,
  code                   text not null,          -- 'VARC', 'DILR', 'QA'
  name                   text not null,
  ordinal                int  not null,
  time_limit_min         int,                    -- null when the exam has no sectional clock
  question_count         int,
  has_own_timer          boolean not null default true,
  counts_toward_score    boolean not null default true,  -- false: MAT's IGE, XAT's GK
  created_at             timestamptz not null default now(),
  unique (exam_id, code)
);

-- The heart of the config layer: a self-referencing taxonomy tree.
-- kind = 'question_type'  → a leaf a single question is tagged to
-- kind = 'set_archetype'  → a DILR/DI set shape, tagged at the set level
-- Both live in one tree so aggregation code walks them identically.
create table if not exists public.question_types (
  id           uuid primary key default gen_random_uuid(),
  exam_id      uuid not null references public.exams (id) on delete cascade,
  section_id   uuid not null references public.sections (id) on delete cascade,
  parent_id    uuid references public.question_types (id) on delete cascade,
  code         text not null,
  name         text not null,
  kind         text not null default 'question_type'
               check (kind in ('question_type', 'set_archetype')),
  depth        int  not null default 0,
  is_leaf      boolean not null default true,   -- only leaves are selectable when logging
  description  text,                            -- shown as a tooltip when the student picks
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (exam_id, code)
);

create index if not exists question_types_parent_idx on public.question_types (parent_id);
create index if not exists question_types_section_idx on public.question_types (section_id);

alter table public.exams          enable row level security;
alter table public.exam_configs   enable row level security;
alter table public.sections       enable row level security;
alter table public.question_types enable row level security;

create policy exams_read          on public.exams          for select to authenticated using (true);
create policy exam_configs_read   on public.exam_configs   for select to authenticated using (true);
create policy sections_read       on public.sections       for select to authenticated using (true);
create policy question_types_read on public.question_types for select to authenticated using (true);
-- No insert/update/delete policies: writes happen only via the service-role seed scripts.
