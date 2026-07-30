"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Sign out. Trivial, but it needed to exist somewhere: until now the only way to
 * leave a session was to clear cookies by hand, which on a shared laptop is a
 * real problem rather than a missing nicety.
 */
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabase.auth.signOut();
        router.replace("/");
        router.refresh();
      }}
      className="font-mono text-[11px] font-medium tracking-[0.06em] text-mute-500 disabled:opacity-50"
    >
      {busy ? "SIGNING OUT…" : "SIGN OUT"}
    </button>
  );
}
