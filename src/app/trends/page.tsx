import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { EvidenceChip, LockedCard } from "@/components/Insight";
import { loadAnalyticsData } from "@/lib/analytics/load";
import { calibration, errorCauses, passageDomains, quadrant, timeTraps } from "@/lib/analytics/questions";
import { pacing, trend } from "@/lib/analytics/trend";
import { QUESTION_BUCKET_SECONDS } from "@/lib/timeBuckets";
import { MIN_INSTANCES } from "@/lib/thresholds";

/**
 * Trends and diagnostics — designs 1j, 1h and 1i on one scrollable screen.
 *
 * Order is deliberate: the trend band first (where am I going), then the
 * quadrant (what should I do more of), then pacing, calibration and error
 * causes (what exactly is going wrong). Verdict first, chart as evidence
 * underneath — never a chart the student has to interpret unaided.
 */
export default async function TrendsPage() {
  const data = await loadAnalyticsData();
  if (!data) redirect("/");

  const { mocks, sections, questions, scheme, providers } = data;

  const tr = trend(mocks, providers);
  const types = quadrant(questions);
  const traps = timeTraps(questions, QUESTION_BUCKET_SECONDS);
  const pace = pacing(sections);
  const cal = calibration(questions, scheme);
  const causes = errorCauses(questions);
  const domains = passageDomains(questions);

  const liveTypes = types.flatMap((c) => (c.status === "ok" ? [c] : []));
  const liveDomains = domains.flatMap((c) => (c.status === "ok" ? [c] : []));

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          TRENDS &amp; DIAGNOSTICS
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          {mocks.length === 0 && data.practiceMockCount === 0
            ? "Nothing logged yet."
            : [
                mocks.length > 0
                  ? `${mocks.length} ${mocks.length === 1 ? "mock" : "mocks"} · timing is your recall`
                  : null,
                data.practiceMockCount > 0
                  ? `${data.practiceMockCount} ASHA ${data.practiceMockCount === 1 ? "mock" : "mocks"} · timing measured`
                  : null,
              ].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pt-4">
        {mocks.length === 0 && data.practiceMockCount === 0 ? (
          <div className="rounded-[14px] border border-ink/[0.1] bg-white p-5">
            <div className="text-[16px] font-semibold leading-snug text-ink">
              Nothing to plot yet.
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
              Log a mock and this fills in. Most readings need three or more before ASHA will say
              anything about them.
            </p>
          </div>
        ) : (
          <>
            {/* ── Trend band (1j) ─────────────────────────────────────────── */}
            <Section label="SCORE BAND">
              {tr.status === "ok" && tr.data.points.length >= 2 ? (
                <div className="rounded-[14px] border border-ink/[0.1] bg-white px-3.5 pb-3 pt-4">
                  <TrendBand points={tr.data.points} centre={tr.data.centre} spread={tr.data.spread} />
                  <div className="mt-2 flex justify-between font-mono text-[9.5px] font-medium text-mute-400">
                    <span>
                      {tr.data.points[0].title.toUpperCase()} · {tr.data.points[0].score}
                    </span>
                    <span>
                      {tr.data.points.at(-1)!.title.toUpperCase()} · {tr.data.points.at(-1)!.score}
                    </span>
                  </div>
                </div>
              ) : (
                <LockedCard
                  title="Score band"
                  message="Two mocks minimum before there's anything to plot."
                  progress={{ have: mocks.length, needed: 2 }}
                />
              )}

              {tr.status === "ok" && (
                <div className="rounded-[13px] bg-ink px-4 py-3.5">
                  <div className="text-[15px] font-semibold leading-snug text-paper text-pretty">
                    {tr.data.spread !== null
                      ? `Your scores sit around ${tr.data.centre}, give or take ${tr.data.spread}.`
                      : `${tr.data.points.length} readings so far, centred on ${tr.data.centre}.`}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
                    {/* The refusal, stated on screen. trend() carries a
                        readonly trendline: null field for the same reason. */}
                    We&rsquo;re not drawing a line through this
                    {providers > 1 ? ` — ${providers} different providers can't support one` : ""}. The
                    band is honest; a slope wouldn&rsquo;t be.
                  </p>
                </div>
              )}
            </Section>

            {/* ── Quadrant (1h) ───────────────────────────────────────────── */}
            <Section label="SPEED vs ACCURACY">
              {liveTypes.length >= 2 ? (
                <>
                  <QuadrantPlot
                    points={liveTypes.map((c) => ({
                      name: c.status === "ok" ? c.data.typeName : "",
                      accuracy: c.status === "ok" ? c.data.accuracy : 0,
                      meanSec: c.status === "ok" ? (c.data.meanSec ?? 0) : 0,
                      quadrant: c.status === "ok" ? c.data.quadrant : null,
                      attempts: c.status === "ok" ? c.data.attempts : 0,
                    }))}
                  />
                  {/* Time in the verdicts is rounded to whole minutes, so a
                      sub-minute engine reads "about 1 minute" rather than "0". */}
                  <p className="px-1 font-mono text-[9.5px] font-medium tracking-[0.06em] text-mute-400">
                    {liveTypes.length} QUESTION TYPES WITH {MIN_INSTANCES.quadrant}+ ATTEMPTS
                  </p>
                  <QuadrantVerdicts types={liveTypes} />
                </>
              ) : (
                <LockedCard
                  title="Speed vs accuracy"
                  message={`Needs at least two question types with ${MIN_INSTANCES.quadrant} attempts each. Tag types as you log and this fills in.`}
                />
              )}

              {traps.some((c) => c.status === "ok") && (
                <div className="flex flex-col gap-1.5">
                  {traps
                    .filter((c) => c.status === "ok")
                    .slice(0, 2)
                    .map((c) =>
                      c.status === "ok" ? (
                        <div
                          key={c.data.typeId}
                          className="rounded-[13px] border border-warn/40 bg-warn/[0.07] px-4 py-3"
                        >
                          <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-warn">
                            TIME TRAP · n={c.supportingN} · {c.confidence.toUpperCase()}
                          </div>
                          <div className="mt-1 text-[14px] font-semibold leading-snug text-ink text-pretty">
                            {c.data.typeName}: {c.data.inSlowestBucket} of {c.data.attempts} attempts ran
                            long, and you were right{" "}
                            {Math.round((c.data.accuracyWhenSlow ?? 0) * 100)}% of those times.
                          </div>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-[#6B6659] text-pretty">
                            Usually you finish these in about {Math.round((c.data.medianSec ?? 0) / 60)}{" "}
                            minute{Math.round((c.data.medianSec ?? 0) / 60) === 1 ? "" : "s"}. When one
                            doesn&rsquo;t, it&rsquo;s costing you rather than paying out.
                          </p>
                        </div>
                      ) : null,
                    )}
                </div>
              )}
            </Section>

            {/* ── Diagnostics (1i) ────────────────────────────────────────── */}
            <Section label="DIAGNOSTICS">
              {/* Pacing */}
              {pace.map((c, i) =>
                c.status === "ok" ? (
                  <div
                    key={c.data.sectionCode}
                    className="rounded-[14px] border border-ink/[0.1] bg-white px-4 py-3.5"
                  >
                    <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
                      PACING · {c.data.sectionCode} · n={c.supportingN} · {c.confidence.toUpperCase()}
                    </div>
                    <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink text-pretty">
                      {c.data.recovers
                        ? `You don't run out of time in ${c.data.sectionCode}. You fall apart in quarter ${c.data.weakestQuarter + 1}.`
                        : `Your ${c.data.sectionCode} marks taper towards the end.`}
                    </div>
                    <QuarterBars marks={c.data.meanByQuarter} weakest={c.data.weakestQuarter} />
                    <p className="mt-2 text-[12px] leading-relaxed text-[#6B6659] text-pretty">
                      {c.data.recovers
                        ? "Marks recover in the quarters after, which means the time was there — this is a single long question eating you, not the clock."
                        : "Marks fall away and stay down. That reads as genuinely running out of clock."}
                    </p>
                  </div>
                ) : (
                  <LockedCard
                    key={`pace-${i}`}
                    title="Pacing"
                    message={c.message}
                    progress={{ have: c.supportingN, needed: MIN_INSTANCES.pacing }}
                  />
                ),
              )}
              {pace.length === 0 && (
                <LockedCard
                  title="Pacing"
                  message="Needs marks-per-quarter for a section, which no mock has yet. Your mock platform's analysis usually shows it."
                />
              )}

              {/* Calibration */}
              {cal.status === "ok" ? (
                <div className="rounded-[14px] border border-ink/[0.1] bg-white px-4 py-3.5">
                  <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
                    CALIBRATION · n={cal.supportingN} · {cal.confidence.toUpperCase()}
                  </div>
                  <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink text-pretty">
                    {calibrationHeadline(cal.data.levels)}
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {cal.data.levels.map((l) => (
                      <div
                        key={l.confidence}
                        className={`flex-1 rounded-[10px] px-2.5 py-2 ${
                          l.confidence === 3
                            ? "bg-cleared/10"
                            : l.confidence === 2
                              ? "bg-warn/[0.12]"
                              : "bg-bad/10"
                        }`}
                      >
                        <div
                          className={`tnum font-mono text-[18px] font-semibold ${
                            l.confidence === 3
                              ? "text-cleared"
                              : l.confidence === 2
                                ? "text-warn"
                                : "text-bad"
                          }`}
                        >
                          {Math.round(l.accuracy * 100)}%
                        </div>
                        <div className="mt-0.5 text-[11px] leading-tight text-[#6B6659]">
                          when {l.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-[#6B6659] text-pretty">
                    {guessingSentence(cal.data)}
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
                    Counts only answers you actually tagged. Batch entry tags the exceptions, so this
                    unlocks more slowly if that&rsquo;s how you log.
                  </p>
                </div>
              ) : (
                <LockedCard
                  title="Calibration"
                  message={cal.message}
                  progress={{ have: cal.supportingN, needed: MIN_INSTANCES.calibration }}
                />
              )}

              {/* Error causes */}
              {causes.map((c, i) =>
                c.status === "ok" ? (
                  <div key={c.data.sectionCode} className="rounded-[14px] bg-ink px-4 py-3.5">
                    <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-brass">
                      ERROR CAUSES · {c.data.sectionCode} · n={c.supportingN} ·{" "}
                      {c.confidence.toUpperCase()}
                    </div>
                    <div className="mt-1.5 text-[15px] font-semibold leading-snug text-paper text-pretty">
                      {c.data.notConceptualShare >= 0.5
                        ? `Most of your ${c.data.sectionCode} losses aren't a syllabus problem.`
                        : `Your ${c.data.sectionCode} losses are mostly genuine concept gaps.`}
                    </div>
                    <CauseBar counts={c.data.counts} />
                  </div>
                ) : (
                  <LockedCard
                    key={`cause-${i}`}
                    title="Error causes"
                    message={c.message}
                    progress={{ have: c.supportingN, needed: MIN_INSTANCES.error_cause }}
                  />
                ),
              )}

              {/* Passage domains — the reason migration 0005 exists. */}
              {liveDomains.length >= 2 && (
                <div className="rounded-[14px] border border-ink/[0.1] bg-white px-4 py-3.5">
                  <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
                    READING PASSAGES BY SUBJECT
                  </div>
                  <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink text-pretty">
                    {liveDomains[0].status === "ok" &&
                      `${liveDomains[0].data.domainName} passages are where you lose most.`}
                  </div>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {liveDomains.map((c) =>
                      c.status === "ok" ? (
                        <div key={c.data.domainId} className="flex items-center gap-2.5">
                          <span className="flex-1 text-[12.5px] text-ink">{c.data.domainName}</span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-sm bg-ink/[0.1]">
                            <div
                              className={`h-full rounded-sm ${
                                c.data.accuracy >= 0.7
                                  ? "bg-cleared"
                                  : c.data.accuracy >= 0.5
                                    ? "bg-warn"
                                    : "bg-bad"
                              }`}
                              style={{ width: `${Math.round(c.data.accuracy * 100)}%` }}
                            />
                          </div>
                          <span className="tnum w-9 text-right font-mono text-[11.5px] font-semibold text-ink">
                            {Math.round(c.data.accuracy * 100)}%
                          </span>
                          <EvidenceChip n={c.supportingN} confidence={c.confidence} />
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        <div className="mt-auto">
          <BottomNav active="trends" />
        </div>
      </div>
    </main>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="px-1 font-mono text-[10.5px] font-medium tracking-[0.16em] text-mute-500">
        {label}
      </div>
      {children}
    </section>
  );
}

/**
 * The score band: points plotted inside a ±1SD band, and no line joining them.
 * Joining the dots would imply a trajectory the data can't support, which is the
 * whole point of design 1j.
 */
function TrendBand({
  points,
  centre,
  spread,
}: {
  points: { mockId: string; score: number; title: string }[];
  centre: number;
  spread: number | null;
}) {
  const scores = points.map((p) => p.score);
  const lo = Math.min(...scores) - 4;
  const hi = Math.max(...scores) + 4;
  const range = Math.max(1, hi - lo);
  const y = (v: number) => `${100 - ((v - lo) / range) * 100}%`;

  return (
    <div className="relative h-[170px]">
      {spread !== null && (
        <>
          <div
            className="absolute inset-x-0 rounded-sm border-y border-dashed border-brass/55 bg-brass/[0.13]"
            style={{ top: y(centre + spread), bottom: `calc(100% - ${y(centre - spread)})` }}
          />
          <div
            className="absolute left-2 font-mono text-[9px] font-medium tracking-[0.08em] text-brass"
            style={{ top: `calc(${y(centre + spread)} - 14px)` }}
          >
            WHERE YOUR SCORES ACTUALLY SIT
          </div>
        </>
      )}
      {points.map((p, i) => (
        <div
          key={p.mockId}
          title={`${p.title}: ${p.score}`}
          className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
          style={{
            left: `${points.length === 1 ? 50 : 7 + (i / (points.length - 1)) * 86}%`,
            top: y(p.score),
          }}
        />
      ))}
    </div>
  );
}

const QUAD_STYLE = {
  fast_right: { dot: "bg-cleared", label: "FAST + RIGHT", text: "text-cleared" },
  slow_right: { dot: "bg-brass", label: "SLOW + RIGHT", text: "text-brass" },
  fast_wrong: { dot: "bg-warn", label: "FAST + WRONG", text: "text-warn" },
  slow_wrong: { dot: "bg-bad", label: "SLOW + WRONG", text: "text-bad" },
} as const;

function QuadrantPlot({
  points,
}: {
  points: {
    name: string;
    accuracy: number;
    meanSec: number;
    quadrant: keyof typeof QUAD_STYLE | null;
    attempts: number;
  }[];
}) {
  const secs = points.map((p) => p.meanSec);
  const loSec = Math.min(...secs);
  const hiSec = Math.max(...secs);
  const secRange = Math.max(1, hiSec - loSec);

  return (
    <div className="relative h-[290px] overflow-hidden rounded-[14px] border border-ink/[0.1] bg-white">
      <div className="absolute inset-x-0 top-1/2 h-px bg-ink/[0.12]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-ink/[0.12]" />
      <span className="absolute left-2.5 top-2 font-mono text-[9px] font-semibold tracking-[0.12em] text-cleared">
        FAST + RIGHT
      </span>
      <span className="absolute right-2.5 top-2 font-mono text-[9px] font-semibold tracking-[0.12em] text-brass">
        SLOW + RIGHT
      </span>
      <span className="absolute bottom-2 left-2.5 font-mono text-[9px] font-semibold tracking-[0.12em] text-warn">
        FAST + WRONG
      </span>
      <span className="absolute bottom-2 right-2.5 font-mono text-[9px] font-semibold tracking-[0.12em] text-bad">
        SLOW + WRONG
      </span>

      {points.map((p) => {
        // x by time (fast left), y by accuracy (accurate top). Inset so labels
        // near an edge stay readable.
        const x = 12 + ((p.meanSec - loSec) / secRange) * 70;
        const y = 90 - p.accuracy * 78;
        const size = Math.min(15, 7 + p.attempts / 4);
        const style = p.quadrant ? QUAD_STYLE[p.quadrant] : null;
        return (
          <div
            key={p.name}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span
              className={`flex-none rounded-full ${style?.dot ?? "bg-mute-400"}`}
              style={{ width: size, height: size }}
            />
            <span className="whitespace-nowrap text-[9.5px] font-medium text-[#4A463D]">
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Four quadrants imply four different fixes — that is the whole argument for the
 * chart, so the fixes are spelled out rather than left to the reader.
 */
function QuadrantVerdicts({
  types,
}: {
  types: {
    status: "ok";
    supportingN: number;
    confidence: "low" | "medium" | "high";
    data: {
      typeName: string;
      quadrant: string | null;
      accuracy: number;
      meanSec: number | null;
      marksPerMinute: number | null;
    };
  }[];
}) {
  // `types` arrives sorted BEST marks-per-minute first, so .find() on slow_wrong
  // returned the mildest offender — it surfaced a 60%-accuracy type while a
  // 39%-at-five-minutes type sat further down. "The one to act on" has to be the
  // worst, so rank explicitly rather than relying on array order.
  const lead = types
    .filter((c) => c.data.quadrant === "fast_right")
    .sort((a, b) => (b.data.marksPerMinute ?? -99) - (a.data.marksPerMinute ?? -99))[0];
  const worst = types
    .filter((c) => c.data.quadrant === "slow_wrong")
    .sort((a, b) => (a.data.marksPerMinute ?? 99) - (b.data.marksPerMinute ?? 99))[0];

  return (
    <div className="flex flex-col gap-1.5">
      {worst && (
        <div className="rounded-[13px] bg-ink px-4 py-3.5">
          <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-brass">
            THE ONE TO ACT ON · n={worst.supportingN} · {worst.confidence.toUpperCase()}
          </div>
          <div className="mt-1.5 text-[15px] font-semibold leading-snug text-paper text-pretty">
            {worst.data.typeName} is costing you{" "}
            {Math.round((worst.data.meanSec ?? 0) / 60)} minutes a question for{" "}
            {Math.round(worst.data.accuracy * 100)}% accuracy.
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
            Slow and wrong. Leave these for the last ten minutes, or not at all.
          </p>
        </div>
      )}
      {lead && (
        <div className="rounded-[13px] border border-ink/[0.1] bg-white px-4 py-3">
          <div className="text-[14px] font-semibold leading-snug text-ink text-pretty">
            {lead.data.typeName} is your engine.
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#6B6659] text-pretty">
            {Math.round(lead.data.accuracy * 100)}% at about{" "}
            {Math.round((lead.data.meanSec ?? 0) / 60)} minute
            {Math.round((lead.data.meanSec ?? 0) / 60) === 1 ? "" : "s"} each. Do all of them in the
            first pass.
          </p>
        </div>
      )}
    </div>
  );
}

function QuarterBars({ marks, weakest }: { marks: number[]; weakest: number }) {
  const peak = Math.max(...marks, 1);
  return (
    <div className="mt-3 flex h-[76px] items-end gap-1.5">
      {marks.map((m, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className={`w-full rounded-t-[5px] ${i === weakest ? "bg-bad" : "bg-cleared"}`}
            style={{ height: Math.max(4, (m / peak) * 62) }}
          />
          <span
            className={`font-mono text-[9.5px] font-medium ${
              i === weakest ? "text-bad" : "text-mute-500"
            }`}
          >
            Q{i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

const CAUSE_STYLE = [
  { key: "conceptual", label: "CONCEPT", bg: "bg-brass", text: "text-brass" },
  { key: "misread", label: "MISREAD", bg: "bg-bad", text: "text-bad" },
  { key: "silly", label: "SILLY", bg: "bg-warn", text: "text-warn" },
  { key: "time", label: "TIME", bg: "bg-[#6B6659]", text: "text-[#8A8578]" },
] as const;

function CauseBar({ counts }: { counts: Record<"conceptual" | "misread" | "silly" | "time", number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-[5px]">
        {CAUSE_STYLE.map((c) => (
          <span key={c.key} className={c.bg} style={{ flex: Math.max(counts[c.key], 0) / total }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-1">
        {CAUSE_STYLE.map((c) => (
          <span key={c.key} className="font-mono text-[10.5px] font-medium text-mute-300">
            <span className={c.text}>■</span> {c.label} {counts[c.key]}
          </span>
        ))}
      </div>
    </>
  );
}

function calibrationHeadline(levels: { confidence: 1 | 2 | 3; accuracy: number }[]): string {
  const certain = levels.find((l) => l.confidence === 3);
  if (certain && certain.accuracy >= 0.85) {
    return `When you feel certain, you're right ${Math.round(certain.accuracy * 100)}% of the time. Trust that.`;
  }
  if (certain) {
    return `You're right ${Math.round(certain.accuracy * 100)}% of the time when you feel certain — that confidence is running ahead of you.`;
  }
  return "Here's how your confidence lines up with being right.";
}

/**
 * The sentence the design got wrong. It is generated from the signed expected
 * value, so it can say "earning" as readily as "costing" — guessing a TITA has
 * no penalty and is therefore free upside. And when the number is small it says
 * so instead of dramatising it (decisions.md).
 */
function guessingSentence(cal: {
  levels: { confidence: 1 | 2 | 3; tagged: number }[];
  expectedMarksFromGuessing: number | null;
  guessingCostsMarks: boolean;
  guessingIsMarginal: boolean;
  breakevenAccuracy: number | null;
}): string {
  const guesses = cal.levels.find((l) => l.confidence === 1)?.tagged ?? 0;
  const ev = cal.expectedMarksFromGuessing;
  if (guesses === 0 || ev === null) return "You haven't tagged any answers as guesses.";

  const breakeven =
    cal.breakevenAccuracy !== null
      ? ` Guessing only pays above ${Math.round(cal.breakevenAccuracy * 100)}% on a negatively-marked question.`
      : "";

  if (cal.guessingIsMarginal) {
    return `You guessed ${guesses} times, and it worked out roughly neutral — about ${Math.abs(ev)} marks either way.${breakeven}`;
  }
  if (cal.guessingCostsMarks) {
    return `You guessed ${guesses} times, which cost you about ${Math.abs(ev)} marks.${breakeven}`;
  }
  return `You guessed ${guesses} times, and it earned you about ${ev} marks — the no-penalty questions make that worth doing.${breakeven}`;
}
