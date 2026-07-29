import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Design screen 2b — first-run profile. Four fields, no more.
 *
 * There is no invite step and no consent step: users are adults, so a new number
 * comes straight here (CLAUDE.md, "Who uses it").
 *
 * The available target years come from `exam_configs.effective_year`, not from a
 * constant in this file. CLAUDE.md forbids exam facts living in code — a pattern
 * or year change must be a data edit.
 */
export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Already profiled? Nothing to do here.
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) redirect("/");

  // Active exams and their configured years. Only CAT is active in v1; GMAT and
  // MAT rows exist so the schema is exercised, and the form shows them disabled
  // rather than hiding them, matching the design's "GMAT — soon" chip.
  const { data: exams } = await supabase
    .from("exams")
    .select("id, code, name, active, exam_configs(effective_year)")
    .order("code");

  const options = (exams ?? []).map((e) => ({
    code: e.code as string,
    active: e.active as boolean,
    years: ((e.exam_configs ?? []) as { effective_year: number }[])
      .map((c) => c.effective_year)
      .sort((a, b) => a - b),
  }));

  return <ProfileForm examOptions={options} />;
}
