-- verify.sql
-- Paste into the Supabase SQL Editor AFTER running migrations 0001–0005.
-- Read-only: creates nothing, changes nothing, safe to run any number of times.
--
-- ONE QUERY, ON PURPOSE. The SQL Editor returns only the final statement's
-- result set, so a file of separate SELECTs silently shows you the last check
-- and throws away the rest. Everything below is a single UNION ALL so all
-- checks come back in one table.
--
-- Read the `result` column top to bottom. Every row must say PASS before
-- running the seed script. Anything else means a migration did not fully apply.
--
-- Why this exists: pasting five files into an editor is exactly where a file
-- gets skipped, or only half of one gets selected before Run. That fails
-- silently — the next migration usually still succeeds, and the gap surfaces
-- later as a missing table or, worse, a table with RLS switched off.

with tables_expected(name) as (
  values ('users'), ('exams'), ('exam_configs'), ('sections'), ('question_types'),
         ('mock_sources'), ('mock_attempts'), ('section_attempts'), ('set_attempts'),
         ('question_attempts'), ('insights'), ('revision_queue')
),
tables_found as (
  select t.name, (c.table_name is not null) as present
  from tables_expected t
  left join information_schema.tables c
    on c.table_schema = 'public' and c.table_name = t.name
),
rls as (
  select c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
pol as (
  select tablename,
         count(*)::int as n,
         string_agg(distinct cmd, ', ' order by cmd) as cmds
  from pg_policies
  where schemaname = 'public'
  group by tablename
),
-- Aggregates computed here rather than inline in the UNION branches: an inline
-- `count(*) filter (...)::text` is ambiguous about what the cast applies to.
tbl_stats as (
  select count(*) filter (where present)     as n_present,
         count(*) filter (where not present) as n_missing,
         string_agg(name, ', ') filter (where not present) as missing_list
  from tables_found
),
rls_stats as (
  select count(*)                                  as n_total,
         count(*) filter (where relrowsecurity)     as n_rls,
         count(*) filter (where not relrowsecurity) as n_norls,
         string_agg(relname, ', ') filter (where not relrowsecurity) as norls_list
  from rls
)
select * from (

  -- 1. All twelve tables present
  select 1 as ord,
         'tables present'::text as check_name,
         (case when n_missing = 0 then 'PASS' else 'FAIL' end)::text as result,
         (n_present::text || ' of 12'
          || coalesce(' — MISSING: ' || missing_list, ''))::text as detail
  from tbl_stats

  -- 2. RLS on every table. A table with RLS off is readable by every
  --    authenticated user — the worst failure available here.
  union all
  select 2,
         'RLS enabled on every table',
         (case when n_norls = 0 then 'PASS' else 'FAIL' end),
         (n_rls::text || ' of ' || n_total::text || ' tables'
          || coalesce(' — RLS OFF: ' || norls_list, ''))
  from rls_stats

  -- 3. Policy shape per table, one row each. Expected:
  --      users            → 4 (select/insert/update/delete, own row only)
  --      reference tables → 1, SELECT only
  --      per-user tables  → 1 FOR ALL (shows as cmd = 'ALL')
  union all
  select 3,
         'policies · ' || tablename,
         (case
            when tablename = 'users' and n = 4 then 'PASS'
            when tablename in ('exams', 'exam_configs', 'sections', 'question_types')
                 and n = 1 and cmds = 'SELECT' then 'PASS'
            when tablename in ('mock_sources', 'mock_attempts', 'section_attempts',
                               'set_attempts', 'question_attempts', 'insights',
                               'revision_queue') and n >= 1 then 'PASS'
            else 'FAIL — unexpected policy shape'
          end),
         n::text || ' policy(ies): ' || cmds
  from pol

  -- 4. The one that matters most, called out on its own line: the app must
  --    never be able to rewrite the shared taxonomy.
  union all
  select 4,
         'reference tables are read-only',
         (case when count(*) = 0 then 'PASS'
               else 'FAIL — write policy on shared reference data' end),
         coalesce(string_agg(tablename || ':' || cmd, ', '), 'no write policies — correct')
  from pg_policies
  where schemaname = 'public'
    and tablename in ('exams', 'exam_configs', 'sections', 'question_types')
    and cmd <> 'SELECT'

  -- 5–7. Migration 0005, checked in three parts because it is the newest file
  --      and so the likeliest to have been missed.
  union all
  select 5,
         '0005 · passage_domain_id column',
         (case when count(*) = 1 then 'PASS' else 'FAIL — run 0005' end),
         count(*)::text || ' found (expected 1)'
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'question_attempts'
    and column_name = 'passage_domain_id'

  union all
  select 6,
         '0005 · kind accepts passage_domain',
         (case when count(*) = 1 then 'PASS' else 'FAIL — run 0005' end),
         coalesce(max(pg_get_constraintdef(oid)), 'constraint not found')
  from pg_constraint
  where conname = 'question_types_kind_check'
    and pg_get_constraintdef(oid) like '%passage_domain%'

  union all
  select 7,
         '0005 · trigger + function',
         (case when count(*) = 2 then 'PASS' else 'FAIL — run 0005' end),
         count(*)::text || ' of 2 objects'
  from (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assert_passage_domain_valid'
    union all
    select 1 from pg_trigger
    where tgname = 'question_attempts_passage_domain_check' and not tgisinternal
  ) t

  -- 8. The phone-lookup function from 0001. Must be security definer or it
  --    cannot read auth.users, which is the entire point of it.
  union all
  select 8,
         '0001 · get_user_id_by_phone',
         (case when count(*) = 1 and bool_or(p.prosecdef) then 'PASS'
               else 'FAIL' end),
         (case when count(*) = 0 then 'missing — run 0001'
               when not bool_or(p.prosecdef) then 'exists but NOT security definer'
               else 'security definer — correct' end)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_user_id_by_phone'

  -- 9. Informational, not a gate: the taxonomy should be empty before seeding.
  --    Non-zero on a fresh project means a partial seed already ran, and the
  --    seed script's assertions would be comparing against stale rows.
  union all
  select 9,
         'taxonomy empty before seeding',
         (case when (select count(*) from public.question_types) = 0
               then 'PASS'
               else 'INFO — already seeded, check counts against EXPECT' end),
         'exams ' || (select count(*) from public.exams)::text
         || ', sections ' || (select count(*) from public.sections)::text
         || ', nodes ' || (select count(*) from public.question_types)::text

) checks
order by ord, check_name;
