-- 0004_insights.sql
-- Generated insights. The honest-data rule is enforced here at the schema level:
-- an insight CANNOT exist without recording how many observations it rests on.

create table if not exists public.insights (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  generated_at      timestamptz not null default now(),

  kind              text not null check (kind in (
                      'set_selection',      -- "you clear Games & Tournaments; you sink in scatter-plot DI"
                      'time_trap',          -- "you spend 2.4x your median on 4-var matrices and still miss"
                      'quadrant',           -- fast-accurate / slow-accurate / fast-wrong / slow-wrong
                      'calibration',        -- confident-and-wrong vs unconfident-and-right
                      'error_cause',        -- "6 of your 9 QA errors were misreads, not concept gaps"
                      'pacing',             -- quarter-by-quarter collapse
                      'skip_regret'         -- "you skipped 4 sets you'd have cleared"
                    )),

  target_type_id    uuid references public.question_types (id),  -- what the insight is about
  headline          text not null,
  rationale         text not null,

  -- NOT NULL BY DESIGN. No insight may be stored without its evidence base.
  supporting_n      int not null check (supporting_n > 0),
  confidence_label  text not null check (confidence_label in ('low', 'medium', 'high')),

  acted_on          boolean not null default false,  -- the primary value metric
  dismissed         boolean not null default false,
  unique (user_id, kind, target_type_id, generated_at)
);

create index if not exists insights_user_idx on public.insights (user_id, generated_at desc);

alter table public.insights enable row level security;
create policy insights_own on public.insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RESERVED (see docs/data-model.md). Defined now so the shape is settled, but nothing
-- writes to it in v1 and no UI reads it. The Leitner micro-quiz layer is v2 at earliest.
create table if not exists public.revision_queue (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  question_type_id uuid not null references public.question_types (id),
  box              int not null default 1 check (box between 1 and 5),  -- 1-3-7-14-30 days
  due_date         date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, question_type_id)
);

alter table public.revision_queue enable row level security;
create policy revision_queue_own on public.revision_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
