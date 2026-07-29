import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-based server client for Server Components and Server Actions.
 *
 * ASHA is deliberately middleware-less, following Dhruva: there is no
 * `middleware.ts` and session gating happens in the Server Components that need
 * it. Fewer moving parts, and no middleware matcher to get subtly wrong.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: cookies are only ever written from Route Handlers
            // and Server Actions.
          }
        },
      },
    },
  );
}
