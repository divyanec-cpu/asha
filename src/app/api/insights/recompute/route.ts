import { NextResponse } from "next/server";
import { recomputeInsights } from "@/lib/analytics/persist";

/**
 * Recomputes and persists the caller's insight ledger. Called after an attempt
 * is marked complete (see log/[attemptId]/CompleteButton.tsx).
 *
 * A server route rather than a client Supabase call because the recompute reads
 * the user's ENTIRE attempt history and runs seven analytics passes over it —
 * doing that inline in a client component would ship all of lib/analytics into
 * the browser bundle for no benefit, since RLS already scopes every query to
 * the caller and there is nothing here that needs the browser.
 */
export async function POST() {
  const result = await recomputeInsights();
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "Not signed in" ? 401 : 500 });
  }
  return NextResponse.json(result);
}
