import { NextResponse } from "next/server";
import { recomputeInsights } from "@/lib/analytics/persist";
import { reconcileRevisionQueue } from "@/lib/revisionStore";

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

  // The revision queue reconciles on the same trigger, since it reads the same
  // completed-attempt history. Kept separate from the insight recompute so a
  // failure in one cannot lose the other — and a queue failure must not fail the
  // response, for the same reason the recompute itself cannot fail a completion:
  // the attempt is already saved and no screen depends on this having run.
  let revision: Awaited<ReturnType<typeof reconcileRevisionQueue>> | null = null;
  try {
    revision = await reconcileRevisionQueue();
  } catch (e) {
    console.error("[revision] reconcile failed:", e);
  }

  return NextResponse.json({ ...result, revision });
}
