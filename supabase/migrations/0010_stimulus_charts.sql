-- 0010_stimulus_charts.sql
-- Lets a DILR exhibit be an actual CHART rather than a table pretending to be one.
--
-- WHY THIS IS A SCHEMA CHANGE AND NOT A TEXT CONVENTION
--
-- Two of CAT's DILR archetypes — chart interpretation and scatter/correlation —
-- test the reading of a graphic. Handing the student a table of exact values does
-- not make an easier chart question; it makes a different question. It tests
-- arithmetic instead of reading, so seeding a table and labelling it
-- 'DILR.ARCH.CHART' would put a false archetype tag on every attempt row derived
-- from it, and the playbook would then report a strength the student may not have.
--
-- WHY A STRUCTURED SPEC RATHER THAN STORED SVG MARKUP
--
-- The obvious alternative is to keep the chart as SVG in `body` and render it with
-- dangerouslySetInnerHTML. That works today and is a latent injection hole
-- tomorrow: `content_sources.kind = 'private'` is a RESERVED case for a student's
-- OWN material, and the moment that becomes writable, stored markup rendered as
-- HTML is user-supplied HTML executing in another page. A structured spec rendered
-- by ASHA's own component cannot carry script, whoever wrote the row.
--
-- The spec is deliberately narrow — bar, line and scatter, with named series of
-- x/y points. It is not a general charting language, and it should not become one.
--
-- Additive and reversible.

-- Extend the kind check. The 0009 constraint was declared inline, so Postgres named
-- it automatically; look the name up rather than guess it. Guessing wrong would
-- leave the old constraint in place, silently rejecting 'chart' while the migration
-- reported success — the same trap as the entry_mode change in 0009.
do $$
declare
  existing_name text;
begin
  select con.conname into existing_name
  from pg_constraint con
  join pg_class rel     on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'question_stimuli'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%kind%'
    and pg_get_constraintdef(con.oid) ilike '%passage%'
  limit 1;

  if existing_name is not null then
    execute format('alter table public.question_stimuli drop constraint %I', existing_name);
  end if;
end $$;

alter table public.question_stimuli
  add constraint question_stimuli_kind_check
  check (kind in ('passage', 'set_data', 'chart'));

-- The chart itself. Shape:
--   {
--     "type":   "bar" | "line" | "scatter",
--     "xLabel": text, "yLabel": text,
--     "yMax":   number (optional; the renderer picks a sensible max otherwise),
--     "series": [ { "name": text,
--                   "points": [ { "x": text|number, "y": number }, ... ] }, ... ]
--   }
alter table public.question_stimuli
  add column if not exists chart_spec jsonb;

-- A chart with no spec cannot render, and a spec on a prose passage is a sign the
-- row was built wrong. Enforced rather than trusted, because either mistake would
-- surface as a blank exhibit in the middle of a timed run.
alter table public.question_stimuli
  drop constraint if exists question_stimuli_chart_spec_shape;
alter table public.question_stimuli
  add constraint question_stimuli_chart_spec_shape
  check (
    (kind = 'chart' and chart_spec is not null and jsonb_typeof(chart_spec) = 'object'
      and chart_spec ? 'type' and chart_spec ? 'series'
      and jsonb_typeof(chart_spec -> 'series') = 'array'
      and jsonb_array_length(chart_spec -> 'series') > 0)
    or (kind <> 'chart' and chart_spec is null)
  );

-- `body` stays not null and carries the prose around the chart — what the exhibit
-- is, what the units are, any caveat. A chart with no words is rarely answerable.
