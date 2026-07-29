"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. The session lives in cookies, and this client both
 * writes them (on signInWithPassword, during the OTP flow) and reads them back
 * on subsequent loads.
 *
 * The publishable key is sent to the browser deliberately. That is safe here
 * because Row Level Security is what protects the data, not key secrecy —
 * every table has owner-only policies, verified by supabase/verify.sql.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
