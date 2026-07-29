import { redirect } from "next/navigation";
import NewAttemptForm from "./NewAttemptForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Create a mock attempt. There is no screen for this in the design handoff —
 * the mockups start at "SimCAT 12 · DILR" — so it is designed here to the same
 * visual language.
 *
 * Everything about the exam's shape (which sections exist, in what order, how
 * many questions each holds) comes from `sections` and `exam_configs`. No exam
 * facts in code.
 */
export default async function NewAttemptPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("target_exam, target_year")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/profile");

  const { data: exam } = await supabase
    .from("exams")
    .select("id, code")
    .eq("code", profile.target_exam)
    .maybeSingle();

  if (!exam) {
    return (
      <Problem
        title="That exam isn't configured yet."
        detail={`Your profile targets ${profile.target_exam}, but there is no row for it in the exams table. Only CAT ships in v1.`}
      />
    );
  }

  // Newest config at or before the target year — the pattern that applied when
  // the mock was written.
  const { data: configs } = await supabase
    .from("exam_configs")
    .select("id, effective_year, mark_correct, mark_wrong_mcq, mark_wrong_numeric, total_questions")
    .eq("exam_id", exam.id)
    .order("effective_year", { ascending: false });

  const config = configs?.[0] ?? null;

  const { data: sections } = await supabase
    .from("sections")
    .select("id, code, name, ordinal, question_count")
    .eq("exam_id", exam.id)
    .order("ordinal");

  if (!config || !sections?.length) {
    return (
      <Problem
        title="This exam has no pattern configured."
        detail="An exam_configs row and section rows are required before a mock can be logged. Run the seed script."
      />
    );
  }

  return (
    <NewAttemptForm
      examId={exam.id}
      examCode={exam.code}
      examConfigId={config.id}
      totalQuestions={config.total_questions}
      sections={sections.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        questionCount: s.question_count,
      }))}
    />
  );
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-3 bg-paper px-7">
      <h1 className="text-[20px] font-semibold text-ink text-pretty">{title}</h1>
      <p className="text-[13px] leading-relaxed text-[#6B6659] text-pretty">{detail}</p>
    </main>
  );
}
