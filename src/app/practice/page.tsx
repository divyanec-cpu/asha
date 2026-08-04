import Link from "next/link";
import { redirect } from "next/navigation";
import StartPaperButton from "./StartPaperButton";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Practice papers ASHA can put on screen.
 *
 * Distinct from `/log`, and the difference is the whole point: `/log` is for a mock
 * the student took somewhere else and is now replaying, where ASHA holds no
 * questions and every timing is recalled. Here ASHA holds the questions, runs the
 * clock, and grades against a stored key — so timings are `measured` and the
 * outcome needs no self-report.
 *
 * Only papers whose source the caller may read are listed, and RLS decides that,
 * not this query. Licensed content shows its owner because the licence requires it.
 */
export default async function PracticePage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("target_exam")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/profile");

  const { data: exam } = await supabase
    .from("exams")
    .select("id")
    .eq("code", profile.target_exam)
    .maybeSingle();

  // NOTE: this select must stay ONE string literal. supabase-js parses the select at
  // the type level, and a concatenation ("a, " + "b") widens to `string`, which makes
  // every field come back as GenericStringError instead of a typed row.
  const { data: papers } = await supabase
    .from("practice_papers")
    .select("id, code, title, description, is_full_mock, time_limit_min, content_sources(kind, owner_name, attribution_required)")
    .eq("exam_id", exam?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("active", true)
    .order("code");

  const rows = papers ?? [];

  // How many questions each paper holds, and which section. Counted rather than
  // stored on the paper, so the number on screen cannot drift from the contents.
  const counts = new Map<string, { questions: number; sectionCodes: string[] }>();
  if (rows.length > 0) {
    const { data: items } = await supabase
      .from("paper_items")
      .select("paper_id, sections(code)")
      .in(
        "paper_id",
        rows.map((p) => p.id),
      );
    for (const row of items ?? []) {
      const entry = counts.get(row.paper_id) ?? { questions: 0, sectionCodes: [] };
      entry.questions += 1;
      const code = one(row.sections)?.code;
      if (code && !entry.sectionCodes.includes(code)) entry.sectionCodes.push(code);
      counts.set(row.paper_id, entry);
    }
  }

  // Past runs. They are deliberately absent from the mock log — a practice set is
  // not a mock — so this is the only place they can be found, which makes listing
  // them here a requirement rather than a nicety.
  const { data: pastRuns } = await supabase
    .from("mock_attempts")
    .select("id, taken_on, total_score, is_complete, practice_papers(title)")
    .not("paper_id", "is", null)
    .order("taken_on", { ascending: false })
    .limit(10);

  return (
    <main className="flex min-h-dvh flex-col bg-paper pb-24">
      <div className="safe-top bg-ink px-5 pb-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-brass">
            PRACTICE
          </span>
          <Link href="/log" className="font-mono text-xs font-medium text-brass">
            MOCK LOG →
          </Link>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          Questions ASHA holds itself, timed and marked here. Your timings are measured rather
          than remembered, so every timing-based reading is on firmer ground than a logged mock.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4">
        {rows.length === 0 && (
          /* The honest-scarcity primitive, same dashed treatment as a locked insight. */
          <div className="rounded-[13px] border border-dashed border-ink/25 bg-transparent px-4 py-6">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#8A8578]">
              NOTHING TO PRACTISE YET
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4A463D] text-pretty">
              No practice papers are available for your exam. ASHA only ever shows questions it
              wrote itself or licensed — it does not carry copies of real mock papers.
            </p>
            <Link
              href="/log"
              className="mt-3 inline-block font-mono text-[11px] font-semibold tracking-[0.06em] text-brass"
            >
              LOG A MOCK YOU TOOK ELSEWHERE →
            </Link>
          </div>
        )}

        {rows.map((paper) => {
          const source = one(paper.content_sources);
          const count = counts.get(paper.id);
          return (
            <div
              key={paper.id}
              className="rounded-[13px] border border-ink/[0.12] bg-white px-4 py-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{paper.title}</span>
                {!paper.is_full_mock && (
                  <span className="shrink-0 font-mono text-[9.5px] font-semibold tracking-[0.08em] text-[#8A8578]">
                    PRACTICE SET
                  </span>
                )}
              </div>

              {paper.description && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#4A463D] text-pretty">
                  {paper.description}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[11.5px] font-medium text-[#6B6659]">
                <span className="tnum">{count?.questions ?? 0} Q</span>
                <span className="tnum">{paper.time_limit_min} MIN</span>
                {count?.sectionCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>

              {/*
                Attribution. Licensed content names its owner because the licence
                requires it; ASHA's own content says so plainly, because "who wrote
                this" is exactly the question a sceptical student should be asking of
                any practice question.
              */}
              <div className="mt-2.5 border-t border-ink/[0.08] pt-2.5 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[#8A8578]">
                {source?.kind === "licensed"
                  ? `LICENSED FROM ${(source.owner_name ?? "UNKNOWN").toUpperCase()}`
                  : source?.kind === "private"
                    ? "YOUR OWN MATERIAL · VISIBLE ONLY TO YOU"
                    : "WRITTEN BY ASHA · NOT FROM ANY REAL PAPER"}
              </div>

              <StartPaperButton paperId={paper.id} title={paper.title} />
            </div>
          );
        })}

        {(pastRuns ?? []).length > 0 && (
          <div className="mt-4">
            <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#8A8578]">
              YOUR PAST RUNS
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {(pastRuns ?? []).map((run) => (
                <Link
                  key={run.id}
                  href={`/log/${run.id}`}
                  className="flex items-baseline justify-between rounded-[11px] border border-ink/[0.10] bg-white px-3.5 py-3"
                >
                  <span className="text-[13.5px] text-ink">
                    {one(run.practice_papers)?.title ?? "Practice"}
                  </span>
                  <span className="ml-3 shrink-0 font-mono text-[11.5px] font-medium text-[#6B6659]">
                    {run.is_complete && run.total_score !== null ? (
                      <span className="tnum">{Number(run.total_score)} MARKS</span>
                    ) : (
                      "UNFINISHED"
                    )}
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-2.5 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[#8A8578]">
              PRACTICE RUNS STAY OUT OF YOUR MOCK COUNT AND YOUR CROSS-MOCK TREND
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
