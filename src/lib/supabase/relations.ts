/**
 * Normalize an embedded Supabase relation to a single row or null.
 *
 * WHY THIS EXISTS. In a select like
 *
 *     .select("id, mock_sources(title)")
 *
 * `mock_sources` is a to-one relationship (the foreign key lives on the queried
 * table), so PostgREST returns an OBJECT at runtime. But without generated
 * database types, supabase-js types every embedded relation as an ARRAY, so
 * `attempt.mock_sources.title` fails to typecheck even though it works.
 *
 * The tempting fix is a cast, which lies. This narrows instead, and copes with
 * either shape — so if a query is later changed to a genuine to-many embed, this
 * returns the first row rather than silently producing undefined properties.
 *
 * The proper fix is generated types (`supabase gen types typescript`), which
 * needs the Supabase CLI. Worth doing once the schema settles; until then this
 * keeps the call sites honest and readable.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
