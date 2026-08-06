import Link from "next/link";
import { redirect } from "next/navigation";
import AuthFlow from "./AuthFlow";
import BottomNav from "@/components/BottomNav";
import { EvidenceChip, Eyebrow, InsightCard, InsightCardDark, LockedCard } from "@/components/Insight";
import { loadAnalyticsData } from "@/lib/analytics/load";
import { mockFacts } from "@/lib/analytics/facts";
import { calibration, errorCauses, quadrant } from "@/lib/analytics/questions";
import { setSelectionPlaybook, skipRegret } from "@/lib/analytics/setSelection";
import { globalConfidence, pacing, trend } from "@/lib/analytics/trend";
import { MIN_INSTANCES, type InsightKind } from "@/lib/thresholds";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Home — designs 1a and 1b.
 *
 * 1a and 1b are not two screens. They are the SAME screen at 12 mocks, 3 mocks
 * and 1 mock, and the difference between them is entirely what has crossed its
 * evidence threshold. So this renders one layout and lets the thresholds decide
 * how much appears. That is the honest-data rule doing the design work.
 *
 * At one mock the student still sees something: descriptive counts of what they
 * logged. Those are FACTS, not claims, so they carry no threshold (data-model.md)
 * — which is why a new user isn't shown an empty screen.
 */
export default async function Page() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <AuthFlow />;

  const { data: profile } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/profile");

  const data = await loadAnalyticsData();
  if (!data) redirect("/");

  const { mocks, sections, sets, questions, scheme, unfinished } = data;
  const initials = profile.name
    .split(/\s+/)
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // ── Nothing logged yet ───────────────────────────────────────────────────
  if (mocks.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col bg-ink">
        <Header initials={initials} chip={<Chip tone="muted">NOTHING LOGGED YET</Chip>} />
        <Sheet>
          {/*
            Two different empty states. Someone who has sat an ASHA mock is NOT
            starting from nothing — they have per-type readings — and telling them
            "it has none yet" would be plainly untrue. What they lack is a score
            trend, which only logged mocks can give, so that is what the copy asks
            for.
          */}
          <div className="rounded-[14px] border border-ink/[0.1] bg-white p-5">
            {data.practiceMockCount > 0 ? (
              <>
                <div className="text-[17px] font-semibold leading-snug text-ink text-pretty">
                  {data.practiceMockCount === 1
                    ? "You've sat one ASHA mock. Now log a real one."
                    : `You've sat ${data.practiceMockCount} ASHA mocks. Now log a real one.`}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
                  Your question-type and timing readings already include those, and they are on the
                  Trends tab. What they cannot give you is a score trend — ASHA&rsquo;s paper
                  isn&rsquo;t calibrated against SimCAT&rsquo;s, so those scores are deliberately
                  kept out of it.
                </p>
              </>
            ) : (
              <>
                <div className="text-[17px] font-semibold leading-snug text-ink text-pretty">
                  Two ways to start.
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
                  ASHA reads your own attempt data, and it has none yet. Log a mock you have already
                  taken, or sit one of ASHA&rsquo;s own practice papers here.
                </p>
              </>
            )}
          </div>
          {unfinished.length > 0 && <ResumeCard attempt={unfinished[0]} />}

          {/*
            Both paths are offered because both put data in, and until practice
            content existed only one of them did. Logging leads, because it is what
            the cross-mock readings are built from — and the practice card says
            plainly that its runs do not feed those readings, rather than letting a
            new student assume they will.
          */}
          <Link
            href="/log/new"
            className="mt-1 rounded-[13px] bg-brass py-4 text-center text-[15px] font-semibold text-white"
          >
            Log a mock you&rsquo;ve taken
          </Link>
          <p className="mt-1.5 text-center font-mono text-[10px] leading-relaxed tracking-[0.04em] text-[#8A8578]">
            ABOUT TEN MINUTES · THE READINGS YOU CAN TRUST ARRIVE AROUND THE THIRD
          </p>

          <Link
            href="/practice"
            className="mt-3 block rounded-[13px] border border-ink/[0.14] bg-white px-4 py-3.5"
          >
            <span className="block text-[14px] font-semibold text-ink">
              Or practise here, right now
            </span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-[#6B6659] text-pretty">
              Questions ASHA wrote itself, timed and marked on the spot. You get a scored paper and
              measured timings — but practice stays out of your mock count and your trend, so it
              is not a substitute for logging real mocks.
            </span>
          </Link>
          <div className="mt-auto">
            <BottomNav active="home" />
          </div>
        </Sheet>
      </main>
    );
  }

  // ── Compute every claim ──────────────────────────────────────────────────
  const playbook = setSelectionPlaybook(sets);
  const regret = skipRegret(sets);
  const cal = calibration(questions, scheme);
  const causes = errorCauses(questions);
  const types = quadrant(questions);
  const pace = pacing(sections);
  const tr = trend(mocks, data.providers);

  // The global confidence chip counts only what is actually live, so the header
  // can never claim more than the cards below it.
  const liveKinds: { kind: InsightKind; supportingN: number }[] = [];
  const pushLive = (kind: InsightKind, c: { status: string; supportingN: number }) => {
    if (c.status === "ok") liveKinds.push({ kind, supportingN: c.supportingN });
  };
  for (const c of playbook) pushLive("set_selection", c);
  pushLive("skip_regret", regret);
  pushLive("calibration", cal);
  for (const c of causes) pushLive("error_cause", c);
  for (const c of types) pushLive("quadrant", c);
  for (const c of pace) pushLive("pacing", c);

  const gc = globalConfidence(
    mocks.length,
    liveKinds,
    mocks.map((m) => m.timingSource),
  );

  const latest = mocks.at(-1)!;
  const latestSections = sections.filter((s) => s.mockId === latest.id);
  const delta = tr.status === "ok" ? tr.data.deltaVsPreviousThree : null;

  // Facts about the latest mock only. mockFacts does no filtering of its own —
  // handing it the whole season would produce sentences that read as being about
  // one paper, which is exactly the overclaim its wording is designed to avoid.
  const latestFacts = mockFacts({
    sets: sets.filter((s) => s.mockId === latest.id),
    questions: questions.filter((q) => q.mockId === latest.id),
    scheme,
  });

  // ── "Change this before the next mock" ───────────────────────────────────
  // Ordered by how cheap the fix is, not by how bad the number looks. A shape
  // that costs whole sets for nothing outranks a percentage.
  const skipOnSight = playbook.find(
    (c) => c.status === "ok" && c.data.recommendation === "skip_on_sight",
  );
  const worstCause = causes
    .filter((c) => c.status === "ok")
    .sort((a, b) =>
      a.status === "ok" && b.status === "ok"
        ? b.data.notConceptualShare - a.data.notConceptualShare
        : 0,
    )[0];
  const worstPace = pace.find((c) => c.status === "ok" && c.data.recovers);

  const chipTone = gc.label === "high" ? "brass" : gc.label === "none" ? "muted" : "warn";

  return (
    <main className="flex min-h-dvh flex-col bg-ink">
      <Header
        initials={initials}
        chip={
          <Chip tone={chipTone}>
            {mocks.length} {mocks.length === 1 ? "MOCK" : "MOCKS"} ·{" "}
            {gc.label === "none" ? "NO CONFIDENT READING YET" : `${gc.label.toUpperCase()} CONFIDENCE`}
            {gc.timingIsEstimated && " · TIMING = YOUR ESTIMATES"}
            {/*
              Per-type readings may include full mocks sat in ASHA, whose questions
              are ASHA's own and therefore not calibrated against a mock provider's.
              The blend is stated rather than assumed harmless — and note it is NOT
              added to the mock count beside it, because those scores stay out.
            */}
            {data.practiceMockCount > 0 &&
              ` · +${data.practiceMockCount} ASHA ${data.practiceMockCount === 1 ? "MOCK" : "MOCKS"} IN TYPE READINGS`}
          </Chip>
        }
      />

      <Sheet>
        {/* Latest score. One reading is a point, not a direction. */}
        <div>
          <Eyebrow>
            {mocks.length === 1 ? "FIRST MOCK" : "LAST MOCK"} · {latest.title.toUpperCase()} ·{" "}
            {formatDate(latest.takenOn)}
          </Eyebrow>
          <div className="mt-2 flex items-end gap-3.5">
            <div className="tnum font-mono text-[54px] font-semibold leading-[0.86] tracking-[-2px] text-ink">
              {latest.totalScore ?? "—"}
            </div>
            <div className="flex flex-col gap-0.5 pb-1.5">
              {delta !== null ? (
                <div
                  className={`text-[13px] font-semibold ${delta >= 0 ? "text-cleared" : "text-bad"}`}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta} vs your last three
                </div>
              ) : (
                <div className="text-[12.5px] leading-snug text-[#6B6659] text-pretty">
                  {mocks.length === 1
                    ? "One reading is a point, not a direction."
                    : `${mocks.length} points. Still noisy.`}
                </div>
              )}
              {tr.status === "ok" && tr.data.spread !== null && (
                <div className="text-[12px] text-[#6B6659]">
                  Your scores sit within ±{tr.data.spread}
                </div>
              )}
            </div>
          </div>

          {latestSections.length > 0 && (
            <div className="mt-3.5 flex gap-1.5">
              {latestSections.map((s) => (
                <div
                  key={s.sectionCode}
                  className="flex-1 rounded-[9px] border border-ink/[0.1] bg-white px-2.5 py-2"
                >
                  <div className="font-mono text-[9.5px] font-medium tracking-[0.1em] text-mute-500">
                    {s.sectionCode}
                  </div>
                  <div className="tnum mt-0.5 font-mono text-[19px] font-semibold text-ink">
                    {s.score ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {unfinished.length > 0 && <ResumeCard attempt={unfinished[0]} />}

        {/* The actionable stack. */}
        <div className="flex flex-col gap-2.5">
          {/*
            Suppressed when facts are present, because "FROM SIMCAT 12" and
            "ACROSS ALL 9 MOCKS" below already section the stack — and they do it
            better, by naming the scope each group of statements actually covers.
            Two eyebrows in a row read as a mistake.
          */}
          {latestFacts.length === 0 && (
            <Eyebrow>
              {liveKinds.length === 0
                ? "HERE'S WHAT'S LOGGED, AND NOTHING MORE"
                : `CHANGE THIS BEFORE MOCK ${mocks.length + 1}`}
            </Eyebrow>
          )}

          {/* At one mock nothing is live, so state the facts and refuse to call
              them a pattern. This is design 1b's middle card verbatim in spirit. */}
          {liveKinds.length === 0 && (
            <div className="rounded-[14px] border border-ink/[0.1] bg-white p-4">
              <div className="text-[15.5px] font-semibold leading-snug text-ink text-pretty">
                {describeRaw(sets, questions)}
              </div>
              <p className="mt-2 border-t border-ink/[0.08] pt-2 text-[12.5px] leading-relaxed text-mute-400 text-pretty">
                We won&rsquo;t call any of that a pattern yet. It isn&rsquo;t one.
              </p>
            </div>
          )}

          {/*
            Facts about the mock just logged — deductive or descriptive, so no
            evidence threshold applies (see lib/analytics/facts.ts). This exists
            because the ten minutes spent logging previously bought back a
            restatement of what had just been typed in, with everything useful
            locked until mock three.

            Shown at EVERY mock count, not only the low-data state: "you left
            three type-in answers blank on this paper" is worth acting on at mock
            one and at mock twelve alike, and it is not something the pattern
            claims below can ever say.
          */}
          {latestFacts.length > 0 && (
            <>
              <Eyebrow>FROM {latest.title.toUpperCase()}</Eyebrow>
              {latestFacts.slice(0, 3).map((fact) => (
                <div
                  key={fact.kind}
                  className="rounded-[14px] border border-brass/40 bg-brass/[0.06] px-4 py-3.5"
                >
                  <div className="text-[14.5px] font-semibold leading-snug text-ink text-pretty">
                    {fact.headline}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B6659] text-pretty">
                    {fact.detail}
                  </p>
                </div>
              ))}
              {liveKinds.length > 0 && <Eyebrow>ACROSS ALL {mocks.length} MOCKS</Eyebrow>}
            </>
          )}

          {skipOnSight?.status === "ok" && (
            <InsightCardDark
              eyebrow={
                <EvidenceChip
                  n={skipOnSight.supportingN}
                  confidence={skipOnSight.confidence}
                  section={{ label: "DILR", tone: "bad" }}
                />
              }
              headline={`Walk past ${skipOnSight.data.archetypeName.toLowerCase()} sets. Every time.`}
              rationale={`You've opened ${skipOnSight.data.timesOpened} and cleared none, for ${skipOnSight.data.minutesSpent} minutes spent. That's a whole set you could have solved.`}
            />
          )}

          {worstCause?.status === "ok" && worstCause.data.dominant && (
            <InsightCard
              eyebrow={
                <EvidenceChip
                  n={worstCause.supportingN}
                  confidence={worstCause.confidence}
                  section={{ label: worstCause.data.sectionCode, tone: "ink" }}
                />
              }
              headline={`${worstCause.data.counts[worstCause.data.dominant]} of your ${worstCause.data.total} ${worstCause.data.sectionCode} errors were ${causeWord(worstCause.data.dominant)}.`}
              // Cites the share that actually supports the claim. The dominant
              // cause can be a plurality rather than a majority — 26 of 79 — so
              // "that's a habit, not a syllabus gap" has to rest on the
              // non-conceptual share, not on the headline count.
              rationale={
                worstCause.data.dominant === "conceptual"
                  ? `${Math.round((1 - worstCause.data.notConceptualShare) * 100)}% of your losses there are genuine concept gaps — that's a revision plan.`
                  : `${Math.round(worstCause.data.notConceptualShare * 100)}% of your losses there aren't concept gaps at all. That's a habit, not a syllabus problem.`
              }
            />
          )}

          {worstPace?.status === "ok" && (
            <InsightCard
              eyebrow={
                <EvidenceChip
                  n={worstPace.supportingN}
                  confidence={worstPace.confidence}
                  section={{ label: worstPace.data.sectionCode, tone: "ink" }}
                />
              }
              headline={`You don't run out of time in ${worstPace.data.sectionCode}. You fall apart in quarter ${worstPace.data.weakestQuarter + 1}.`}
              rationale="Marks recover afterwards, which means the time was there."
            />
          )}

          {/* Locked cards, so the student can see what's coming and why. */}
          {cal.status === "below_threshold" && (
            <LockedCard
              title="Calibration"
              message={cal.message}
              progress={{ have: cal.supportingN, needed: MIN_INSTANCES.calibration }}
            />
          )}
          {regret.status === "below_threshold" && (
            <LockedCard
              title="Skip regret"
              message={regret.message}
              progress={{ have: regret.supportingN, needed: MIN_INSTANCES.skip_regret }}
            />
          )}
          {playbook.every((c) => c.status === "below_threshold") && playbook.length > 0 && (
            <LockedCard
              title="Set-selection playbook"
              message="No set shape has been opened five times yet. Log more mocks — including the sets you skip."
            />
          )}
        </div>

        <div className="mt-auto">
          <BottomNav active="home" />
        </div>
      </Sheet>
    </main>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Header({ initials, chip }: { initials: string; chip: React.ReactNode }) {
  return (
    <div className="safe-top flex flex-col gap-3 px-5 pb-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[13px] font-semibold tracking-[0.3em] text-paper">ASHA</div>
        <Link
          href="/account"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-paper/[0.12] font-mono text-[11px] font-semibold text-paper"
        >
          {initials || "·"}
        </Link>
      </div>
      {chip}
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brass" | "warn" | "muted";
}) {
  const styles =
    tone === "brass"
      ? "border-brass/40 bg-brass/[0.09] text-brass-lit"
      : tone === "warn"
        ? "border-warn/35 bg-warn/[0.08] text-[#E0B478]"
        : "border-paper/[0.16] bg-paper/[0.05] text-mute-300";
  const dot = tone === "brass" ? "bg-brass" : tone === "warn" ? "bg-warn" : "bg-[#6B6659]";
  return (
    <div className={`flex items-center gap-2 rounded-[10px] border px-3 py-2.5 ${styles}`}>
      <span className={`h-[7px] w-[7px] flex-none rounded-full ${dot}`} />
      <span className="font-mono text-[10.5px] font-medium leading-snug tracking-[0.02em]">
        {children}
      </span>
    </div>
  );
}

/** The paper sheet that the ink header sits behind. */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-t-[26px] bg-paper px-5 pt-6">{children}</div>
  );
}

function ResumeCard({ attempt }: { attempt: { id: string; title: string } }) {
  return (
    <Link
      href={`/log/${attempt.id}`}
      className="flex items-center justify-between rounded-[13px] border border-brass/45 bg-brass/[0.07] px-4 py-3.5"
    >
      <div>
        <div className="text-[14px] font-semibold text-ink">{attempt.title} isn&rsquo;t finished</div>
        <div className="mt-0.5 text-[12px] text-[#6B6659]">
          It won&rsquo;t count towards anything until it is.
        </div>
      </div>
      <span className="font-mono text-[11px] text-brass">RESUME →</span>
    </Link>
  );
}

/**
 * Descriptive counts for a student with too little data for any claim.
 * Facts, not claims — hence no threshold. Deliberately phrased as a tally.
 */
function describeRaw(
  sets: { chosen: boolean; verdict: string | null }[],
  questions: { isCorrect: boolean | null; errorCause: string | null }[],
): string {
  const opened = sets.filter((s) => s.chosen).length;
  const cleared = sets.filter((s) => s.verdict === "cleared").length;
  const wrong = questions.filter((q) => q.isCorrect === false).length;
  const parts: string[] = [];
  if (opened > 0) {
    parts.push(`You attempted ${opened} DILR ${opened === 1 ? "set" : "sets"} and cleared ${cleared}.`);
  }
  if (wrong > 0) parts.push(`You got ${wrong} ${wrong === 1 ? "question" : "questions"} wrong.`);
  return parts.length > 0 ? parts.join(" ") : "Here's what's logged, and nothing more.";
}

function causeWord(cause: "conceptual" | "misread" | "silly" | "time"): string {
  return cause === "conceptual"
    ? "concept gaps"
    : cause === "misread"
      ? "misreads"
      : cause === "silly"
        ? "careless slips"
        : "time";
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${d} ${months[m - 1]}`;
}
