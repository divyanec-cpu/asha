import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service";

/**
 * Permanently deletes the caller's account.
 *
 * WHY THIS NEEDS A SERVER ROUTE. Deleting the `public.users` row cascades to
 * every attempt, but leaves the `auth.users` identity behind — so the phone
 * number would still resolve to an account and signing in again would land the
 * person in a ghost profile. Removing an auth identity requires the admin API,
 * which requires the service-role key, which must never reach the browser.
 *
 * Deleting `auth.users` is enough on its own: `public.users.id` references it
 * with ON DELETE CASCADE, and the whole attempt chain cascades from there
 * (mock_sources → mock_attempts → section_attempts → set/question_attempts),
 * plus insights and revision_queue. One delete, nothing orphaned.
 *
 * THE IDENTITY COMES FROM THE SESSION, NEVER FROM THE REQUEST BODY. A route that
 * accepted a user id would let any authenticated caller delete anyone.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceRoleSupabaseClient();

  // Belt and braces: cascade should handle this, but deleting the profile row
  // first means that if the auth delete fails for any reason, the personal data
  // is already gone rather than half-gone.
  const { error: profileError } = await service.from("users").delete().eq("id", user.id);
  if (profileError) {
    console.error("[account/delete] profile delete failed:", profileError.message);
    return NextResponse.json(
      { ok: false, error: "Could not delete your data" },
      { status: 500 },
    );
  }

  const { error: authDeleteError } = await service.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    // The profile and all attempts are already gone at this point, so the
    // person's data IS deleted — only the empty login remains. Say so honestly
    // rather than reporting a clean success or a total failure.
    console.error("[account/delete] auth delete failed:", authDeleteError.message);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Your data was deleted, but the login itself could not be removed. Contact us and we'll finish it.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
