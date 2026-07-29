-- 0005_passage_domain.sql
-- Adds the second tag on a VARC reading-comprehension question: the subject
-- domain of the passage it hung off, alongside the question type.
--
-- WHY: the taxonomy seeds 7 VARC.PASSAGE.* nodes and its own description tells
-- the logger to tag the passage domain AND the question type — but
-- question_attempts had a single question_type_id, so both could not be stored.
-- Those 7 nodes were unreachable reference data and the instruction was
-- impossible to follow. Domain is frequently the real variable: an aspirant who
-- is fine on business passages and lost in abstract philosophy has a different
-- problem from one who is weak at inference.
--
-- See docs/decisions.md, 2026-07-29, including the rejected passage_attempts
-- alternative (a table between section and question, mirroring set_attempts).
--
-- Additive and reversible. No existing column changes meaning. Rollback is at
-- the foot of this file.

-- ─── 1. Passage domain becomes a third taxonomy kind ────────────────────────
-- `kind` already records the level at which a taxonomy node is tagged:
--   question_type  → on a question,     via question_attempts.question_type_id
--   set_archetype  → on a DILR set,     via set_attempts.archetype_id
--   passage_domain → on a question's passage, via the new column below
--
-- Making this explicit does two jobs. It keeps the integrity check in step 3
-- data-driven instead of matching a hardcoded code prefix. And it stops the
-- domain leaves being offered in a question-type picker — as things stand,
-- "Economics / business" is kind = 'question_type' and would appear in the list
-- of RC question types, which is wrong. That bug is fixed here before any UI
-- exists to expose it.

alter table public.question_types
  drop constraint if exists question_types_kind_check;

alter table public.question_types
  add constraint question_types_kind_check
  check (kind in ('question_type', 'set_archetype', 'passage_domain'));

-- Reclassify domain leaves that are already seeded. Updates zero rows on a
-- database seeded after this migration (the seed script now writes the kind
-- directly) and zero rows on a database never seeded at all. Safe to re-run.
-- Only leaves: VARC.PASSAGE itself is a grouping node and stays a
-- question_type, matching how DILR.ARCH already groups the set archetypes.
update public.question_types
   set kind = 'passage_domain'
 where code like 'VARC.PASSAGE.%'
   and is_leaf
   and kind <> 'passage_domain';

-- ─── 2. The column ──────────────────────────────────────────────────────────
-- Nullable, and null for the overwhelming majority of rows: every QA question,
-- every DILR question, and every VARC verbal-ability question. Only RC
-- questions carry it.

alter table public.question_attempts
  add column if not exists passage_domain_id uuid references public.question_types (id);

comment on column public.question_attempts.passage_domain_id is
  'Subject domain of the RC passage this question belonged to. Null outside VARC RC. '
  'Must reference a question_types row with kind = ''passage_domain'' and is_leaf = true; '
  'enforced by trigger, since a foreign key cannot express it.';

-- Partial index: analytics group by this column, but almost every row is null,
-- so there is no reason to index the nulls.
create index if not exists question_attempts_passage_domain_idx
  on public.question_attempts (passage_domain_id)
  where passage_domain_id is not null;

-- ─── 3. Enforce that it points at a passage-domain leaf ─────────────────────
-- A foreign key can only say "some question_types row" — it cannot say "one of
-- the passage-domain leaves". A CHECK constraint cannot run the subquery that
-- would be needed. Hence a trigger.
--
-- It reads `kind` from the taxonomy rather than matching on a code prefix, so
-- seeding another exam's passage domains later needs no change here. That also
-- keeps it consistent with the rule in CLAUDE.md: the taxonomy is data, and
-- code must not hardcode taxonomy strings.

create or replace function public.assert_passage_domain_valid()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind    text;
  v_is_leaf boolean;
begin
  -- Null is the normal case for most rows; nothing to check.
  if new.passage_domain_id is null then
    return new;
  end if;

  select kind, is_leaf
    into v_kind, v_is_leaf
    from public.question_types
   where id = new.passage_domain_id;

  if v_kind is distinct from 'passage_domain' then
    raise exception
      'passage_domain_id must reference a passage_domain node; got kind = %',
      coalesce(v_kind, '(no such question_types row)')
      using errcode = 'check_violation';
  end if;

  -- Grouping nodes are not selectable when logging, here as anywhere else.
  if not v_is_leaf then
    raise exception
      'passage_domain_id must reference a leaf node, not a grouping node'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists question_attempts_passage_domain_check on public.question_attempts;

create trigger question_attempts_passage_domain_check
  before insert or update of passage_domain_id on public.question_attempts
  for each row execute function public.assert_passage_domain_valid();

-- RLS needs no change: question_attempts already has an owner-only policy
-- covering all operations, and ownership is still inherited by join through
-- section_attempts → mock_attempts → user_id. A new column on an existing
-- table inherits the existing policy.

-- ─── Rollback ───────────────────────────────────────────────────────────────
-- Reverses cleanly as long as no row has a non-null passage_domain_id that you
-- care about keeping — dropping the column discards those tags.
--
--   drop trigger if exists question_attempts_passage_domain_check
--     on public.question_attempts;
--   drop function if exists public.assert_passage_domain_valid();
--   drop index if exists public.question_attempts_passage_domain_idx;
--   alter table public.question_attempts drop column if exists passage_domain_id;
--   update public.question_types set kind = 'question_type'
--    where kind = 'passage_domain';
--   alter table public.question_types
--     drop constraint if exists question_types_kind_check;
--   alter table public.question_types
--     add constraint question_types_kind_check
--     check (kind in ('question_type', 'set_archetype'));
