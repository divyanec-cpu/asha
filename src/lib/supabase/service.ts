import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * The `server-only` import above makes any client-side import of this file a
 * build error. That is the guardrail; do not remove it.
 *
 * Two legitimate uses in ASHA:
 *   1. Auth bootstrap (api/otp/verify) — creating the auth user and setting the
 *      one-time password, neither of which the user can do for themselves.
 *   2. Seed scripts — the shared reference tables have no write policy at all.
 *
 * Anywhere else, use the cookie-based server client so RLS does its job. When
 * you must use this client, always select specific columns and never return its
 * results without an explicit ownership check of your own — there is no RLS
 * backstop here.
 */
export function createServiceRoleSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
