import { redirect } from "next/navigation";
import AuthFlow from "./AuthFlow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The session gate.
 *
 *   no session          → the auth flow (design 2a)
 *   session, no profile → /profile (design 2b)
 *   session + profile   → home
 *
 * ASHA is middleware-less (see lib/supabase/server.ts), so gating lives here in
 * the Server Component rather than in a matcher.
 */
export default async function Page() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <AuthFlow />;

  // RLS restricts this to the caller's own row, so no explicit filter on
  // user_id is needed — but being explicit costs nothing and documents intent.
  const { data: profile } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/profile");

  // Home is Phase 6 (design 1a/1b). Placeholder until then — deliberately says
  // so rather than showing an empty dashboard that looks broken.
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-5 bg-ink px-7">
      <div>
        <div className="font-mono text-xl font-semibold tracking-[0.35em] text-paper">ASHA</div>
        <div className="mt-3 h-0.5 w-11 bg-brass" />
      </div>
      <p className="text-lg leading-snug text-paper text-pretty">
        You&rsquo;re signed in, {profile.name}.
      </p>
      <p className="text-[13.5px] leading-relaxed text-mute-500 text-pretty">
        Home, the set-selection playbook and mock logging are still being built. Nothing here is
        showing you numbers yet &mdash; when it does, every one of them will be your own.
      </p>
      <p className="font-mono text-[11px] tracking-widest text-mute-400">PHASE 2 · AUTH COMPLETE</p>
    </main>
  );
}
