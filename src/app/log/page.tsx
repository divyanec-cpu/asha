import Link from "next/link";
import { redirect } from "next/navigation";
import { one } from "@/lib/supabase/relations";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The mock log — every attempt, with unfinished ones surfaced first.
 *
 * `mock_attempts.is_complete` exists because review entry is long enough that it
 * must be resumable, and an abandoned half-logged mock is the single likeliest
 * churn event (data-model.md). So a half-finished attempt is not a quiet row in
 * a list; it is the first thing on the screen.
 */
export default async function LogPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: attempts } = await supabase
    .from("mock_attempts")
    .select("id, taken_on, total_score, percentile_reported, is_complete, mock_sources(title, provider)")
    .order("taken_on", { ascending: false });

  const rows = attempts ?? [];
  const unfinished = rows.filter((a) => !a.is_complete);
  const finished = rows.filter((a) => a.is_complete);

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="bg-ink px-6 pb-4 pt-2">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          YOUR MOCK LOG
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300">
          {rows.length === 0
            ? "Nothing logged yet. The first one takes about ten minutes."
            : `${rows.length} ${rows.length === 1 ? "mock" : "mocks"} logged.`}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-5 pt-4">
        {unfinished.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>PICK UP WHERE YOU LEFT OFF</SectionLabel>
            {unfinished.map((a) => (
              <Link
                key={a.id}
                href={`/log/${a.id}/dilr`}
                className="flex items-center justify-between rounded-[13px] border border-brass/45 bg-brass/[0.07] px-4 py-3.5"
              >
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">
                    {one(a.mock_sources)?.title ?? "Untitled mock"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-mute-500">
                    {formatDate(a.taken_on)} · NOT FINISHED
                  </div>
                </div>
                <span className="font-mono text-xs text-brass">RESUME →</span>
              </Link>
            ))}
          </section>
        )}

        {finished.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>LOGGED</SectionLabel>
            {finished.map((a) => (
              <Link
                key={a.id}
                href={`/log/${a.id}/dilr`}
                className="flex items-center justify-between rounded-[13px] border border-ink/[0.1] bg-white px-4 py-3.5"
              >
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">
                    {one(a.mock_sources)?.title ?? "Untitled mock"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-mute-500">
                    {formatDate(a.taken_on)}
                    {a.percentile_reported !== null && ` · ${a.percentile_reported} %ILE REPORTED`}
                  </div>
                </div>
                {a.total_score !== null && (
                  <span className="tnum font-mono text-lg font-semibold text-ink">
                    {a.total_score}
                  </span>
                )}
              </Link>
            ))}
          </section>
        )}

        {rows.length === 0 && (
          <div className="rounded-[14px] border border-ink/[0.1] bg-white p-5">
            <div className="text-[17px] font-semibold leading-snug text-ink text-pretty">
              You take the mock elsewhere. Log it here.
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
              ASHA needs your own attempt data before it can tell you anything — and it won&rsquo;t
              claim a pattern from one mock. The first useful readings arrive around the third.
            </p>
          </div>
        )}

        <div className="mt-auto pb-6 pt-2">
          <Link
            href="/log/new"
            className="block rounded-[13px] bg-brass py-4 text-center text-[15px] font-semibold text-white"
          >
            Log a mock
          </Link>
          <Link
            href="/"
            className="mt-3 block text-center font-mono text-[11.5px] text-mute-500"
          >
            BACK
          </Link>
        </div>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-mute-500">
      {children}
    </div>
  );
}

/** "2026-07-26" → "26 JUL". Date only, no timezone conversion: taken_on is a
 *  calendar date, and shifting it by a timezone would be wrong. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${d} ${months[m - 1]} ${String(y).slice(2)}`;
}
