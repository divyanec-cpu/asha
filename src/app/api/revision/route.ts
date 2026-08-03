import { NextRequest, NextResponse } from "next/server";
import { markRevised, removeTopic } from "@/lib/revisionStore";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Revision queue actions: mark a topic revised, or retire it.
 *
 * The identity comes from the session; the body only names a topic. RLS scopes
 * every write to the caller, so a `question_type_id` belonging to someone else's
 * queue row simply matches nothing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  let body: { action?: unknown; questionTypeId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request" }, { status: 400 });
  }

  const { action, questionTypeId } = body;
  if (typeof questionTypeId !== "string" || questionTypeId === "") {
    return NextResponse.json({ ok: false, error: "Missing topic" }, { status: 400 });
  }

  if (action === "revised") {
    const result = await markRevised(questionTypeId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  if (action === "remove") {
    const result = await removeTopic(questionTypeId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
