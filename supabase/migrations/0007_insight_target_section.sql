-- 0007_insight_target_section.sql
-- Adds a second target column so section-scoped insights can be told apart.
--
-- WHY: `error_cause` and `pacing` are computed PER SECTION (see
-- lib/analytics/questions.ts errorCauses() and lib/analytics/trend.ts pacing()),
-- not per question type. `insights.target_type_id` only references
-- `question_types`, so a VARC error-cause row and a QA error-cause row were both
-- forced to target_type_id = null — indistinguishable from each other.
--
-- That silently breaks the carry-forward rule already on record in
-- docs/decisions.md ("Insight recompute must preserve acted_on and dismissed"):
-- recompute matches prior rows by (kind, target_type_id), and with both VARC and
-- QA error-cause insights sharing kind='error_cause', target_type_id=null, a
-- dismissal of one would incorrectly carry onto the other. Found while writing
-- the persistence code in lib/analytics/persist.ts, before any row was written
-- with the bug live — so no historical data needs migrating.
--
-- Additive and reversible. Rollback at the foot of the file.

alter table public.insights
  add column if not exists target_section_id uuid references public.sections (id);

comment on column public.insights.target_section_id is
  'Set for section-scoped insights (error_cause, pacing). Null for insights scoped '
  'to a question/set type (target_type_id) or to the account as a whole '
  '(calibration, skip_regret). A row should carry AT MOST ONE of target_type_id / '
  'target_section_id set — enforced by insight_target_not_both below, not by the '
  'application, since a schema guarantee cannot be bypassed by a future code path.';

-- A row must not claim to be about both a type AND a section — that would be two
-- different insights sharing one row. Also written now, before any row exists
-- that could violate it.
alter table public.insights
  drop constraint if exists insight_target_not_both;
alter table public.insights
  add constraint insight_target_not_both
  check (not (target_type_id is not null and target_section_id is not null));

-- Widen the uniqueness key to include the new column. Postgres treats NULL as
-- distinct from NULL in a unique constraint, so this does not by itself dedupe
-- section-scoped rows against each other — that dedup is an application-level
-- concern (persist.ts carries forward by matching kind + both target columns).
-- The constraint's job is only to stop a literal duplicate insert within one
-- recompute batch. Constraint name looked up dynamically rather than
-- hardcoded, because Postgres's auto-generated name for the original inline
-- `unique (...)` in 0004 is derived from the column list and easy to get wrong
-- by hand.
do $$
declare
  v_old_name text;
begin
  select con.conname into v_old_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'insights'
    and con.contype = 'u'
    and con.conname <> 'insights_user_kind_target_generated_key';

  if v_old_name is not null then
    execute format('alter table public.insights drop constraint %I', v_old_name);
  end if;
end $$;

alter table public.insights
  drop constraint if exists insights_user_kind_target_generated_key;
alter table public.insights
  add constraint insights_user_kind_target_generated_key
  unique (user_id, kind, target_type_id, target_section_id, generated_at);

-- RLS needs no change: the existing owner-only policy covers every column.

-- ─── Rollback ───────────────────────────────────────────────────────────────
--   alter table public.insights
--     drop constraint if exists insights_user_kind_target_generated_key;
--   alter table public.insights
--     add constraint insights_user_id_kind_target_type_id_generated_at_key
--     unique (user_id, kind, target_type_id, generated_at);
--   alter table public.insights drop constraint if exists insight_target_not_both;
--   alter table public.insights drop column if exists target_section_id;
