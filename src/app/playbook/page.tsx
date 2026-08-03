import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { EvidenceChip, LockedCard } from "@/components/Insight";
import { loadAnalyticsData } from "@/lib/analytics/load";
import { setSelectionPlaybook, skipRegret } from "@/lib/analytics/setSelection";
import type { Recommendation } from "@/lib/analytics/setSelection";
import { MIN_INSTANCES } from "@/lib/thresholds";
import RevisionQueue from "./RevisionQueue";
import { dueToday } from "@/lib/analytics/revision";
import { loadQueue, todayIso } from "@/lib/revisionStore";

/**
 * The set-selection playbook — design 1c, the ranked ledger.
 *
 * The handoff offers this and 1d (a memorisable exam-day pick order) as
 * alternative presentations of identical data. 1c ships because its stated
 * audience is "the student who wants to audit the claim", which is ASHA's whole
 * audience — a sceptical analytical adult. 1d's verdict-first framing is carried
 * by the recommendation badges, and can be added later as a second view with no
 * schema or analytics change.
 *
 * Every row shows its own evidence. A shape below threshold renders as a locked
 * row rather than vanishing, so the student can see what is coming and why.
 */
export default async function PlaybookPage() {
  const data = await loadAnalyticsData();
  if (!data) redirect("/");

  const { sets, mocks } = data;
  const playbook = setSelectionPlaybook(sets);
  const regret = skipRegret(sets);
  const live = playbook.filter((c) => c.status === "ok");

  const totalSets = sets.length;

  // The revision queue. Read here rather than reconciled — reconciliation happens
  // on attempt completion, so rendering the playbook never writes.
  const queue = await loadQueue();
  const { due, deferred } = dueToday(queue, todayIso());

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
          SET-SELECTION PLAYBOOK
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          {totalSets === 0
            ? "No DILR sets logged yet."
            : `${totalSets} ${totalSets === 1 ? "set" : "sets"} across ${mocks.length} ${
                mocks.length === 1 ? "mock" : "mocks"
              } · timing from your estimates`}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
        {totalSets === 0 ? (
          <div className="rounded-[14px] border border-ink/[0.1] bg-white p-5">
            <div className="text-[16px] font-semibold leading-snug text-ink text-pretty">
              This is the one that pays for itself.
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B6659] text-pretty">
              With five sets and time for three, DILR marks come from picking correctly rather than
              solving faster. Log every set — including the ones you never opened — and this becomes
              your own pick-and-skip order.
            </p>
          </div>
        ) : (
          <>
            {/* Column header, mono, spreadsheet energy. */}
            <div className="flex gap-2 px-1 font-mono text-[9.5px] font-medium tracking-[0.1em] text-mute-500">
              <span className="flex-1">ARCHETYPE</span>
              <span className="w-9 text-right">CLEAR</span>
              <span className="w-10 text-right">AVG</span>
              <span className="w-9 text-right">M/MIN</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {playbook.map((c, i) =>
                c.status === "ok" ? (
                  <PlaybookRow
                    key={c.data.archetypeId ?? c.data.archetypeName}
                    name={c.data.archetypeName}
                    clearRate={c.data.clearRate}
                    medianClearSec={c.data.medianClearSec}
                    marksPerMinute={c.data.marksPerMinute}
                    recommendation={c.data.recommendation}
                    minutesSpent={c.data.minutesSpent}
                    n={c.supportingN}
                    confidence={c.confidence}
                  />
                ) : (
                  <LockedCard
                    key={`locked-${i}`}
                    title="Another shape, not enough of it yet"
                    message={c.message}
                    progress={{ have: c.supportingN, needed: MIN_INSTANCES.set_selection }}
                  />
                ),
              )}
            </div>

            {live.length === 0 && (
              <p className="px-1 text-[12px] leading-relaxed text-mute-400 text-pretty">
                Nothing is ranked yet. A shape needs five openings before its clear rate means
                anything — until then a single lucky set would read as mastery.
              </p>
            )}

            {/* Skip regret — the counterpart question: is the scanning too timid? */}
            {regret.status === "ok" ? (
              <div className="mt-1 rounded-[14px] bg-ink px-4 py-3.5">
                <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-brass">
                  SKIP REGRET · n={regret.supportingN} · {regret.confidence.toUpperCase()}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold leading-snug text-paper text-pretty">
                  {regret.data.wouldHaveCleared === 0
                    ? `You walked past ${regret.data.skippedSets} sets, and none of them were winnable.`
                    : `You'd have cleared ${regret.data.wouldHaveCleared} of the ${regret.data.skippedSets} sets you walked past.`}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
                  {/* The shape attribution only earns a mention when it is
                      actually a cluster. "1 of them was arrangements" out of 3
                      is not a pattern, and phrasing it as one would be the
                      overclaim this whole product refuses to make. */}
                  {regret.data.wouldHaveCleared === 0
                    ? "Your scanning is doing its job — you are skipping the right things."
                    : regret.data.byArchetype[0] && regret.data.byArchetype[0].count >= 2
                      ? `${regret.data.byArchetype[0].count} of them were ${regret.data.byArchetype[0].archetypeName.toLowerCase()}. Your scan reads shape well — check whether you're bailing on length.`
                      : "Too few, and too scattered across shapes, to blame any one kind of set. Worth watching whether your scan is too timid."}
                </p>
              </div>
            ) : (
              <LockedCard
                title="Skip regret"
                message={regret.message}
                progress={{ have: regret.supportingN, needed: MIN_INSTANCES.skip_regret }}
              />
            )}
          </>
        )}

        {/*
          The revision queue lives here rather than behind a fifth nav tab: the
          bottom nav is fixed at four by the design, and this belongs next to the
          playbook because both answer "what do I do before the next mock" — the
          playbook for set selection, this for the concept gaps.
        */}
        <div className="mt-2 flex flex-col gap-2">
          <div className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-mute-500">
            REVISE TODAY
          </div>
          <RevisionQueue due={due} deferred={deferred} totalTracked={queue.length} />
        </div>

        <div className="mt-auto">
          <BottomNav active="playbook" />
        </div>
      </div>
    </main>
  );
}

const BADGE: Record<Recommendation, { label: string; chip: string; edge: string }> = {
  pick_first: { label: "PICK FIRST", chip: "bg-cleared text-white", edge: "border-l-cleared" },
  pick_second: {
    label: "PICK SECOND",
    chip: "bg-cleared-soft text-white",
    edge: "border-l-cleared-soft",
  },
  only_if_third: { label: "ONLY IF THIRD", chip: "bg-warn text-white", edge: "border-l-warn" },
  hold: { label: "HOLD", chip: "bg-ink/10 text-[#6B6659]", edge: "border-l-mute-400" },
  skip_on_sight: { label: "SKIP ON SIGHT", chip: "bg-bad text-white", edge: "border-l-bad" },
};

function PlaybookRow({
  name,
  clearRate,
  medianClearSec,
  marksPerMinute,
  recommendation,
  minutesSpent,
  n,
  confidence,
}: {
  name: string;
  clearRate: number | null;
  medianClearSec: number | null;
  marksPerMinute: number | null;
  recommendation: Recommendation;
  minutesSpent: number;
  n: number;
  confidence: "low" | "medium" | "high";
}) {
  const badge = BADGE[recommendation];
  const doomed = recommendation === "skip_on_sight";
  const pctColour =
    clearRate === null
      ? "text-mute-400"
      : clearRate === 0
        ? "text-bad"
        : clearRate >= 0.6
          ? "text-cleared"
          : "text-warn";

  return (
    <div
      className={`rounded-[10px] border border-l-[3px] bg-white px-3 py-2.5 ${badge.edge} ${
        doomed ? "border-bad/30 bg-bad/[0.05]" : "border-ink/[0.12]"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`flex-1 text-[13.5px] font-semibold text-ink ${
            doomed ? "line-through decoration-bad/60" : ""
          }`}
        >
          {name}
        </span>
        <span className={`tnum w-9 text-right font-mono text-[13px] font-semibold ${pctColour}`}>
          {clearRate === null ? "—" : `${Math.round(clearRate * 100)}%`}
        </span>
        <span className="tnum w-10 text-right font-mono text-[13px] font-medium text-ink">
          {medianClearSec === null ? "—" : formatMinSec(medianClearSec)}
        </span>
        <span className="tnum w-9 text-right font-mono text-[13px] font-semibold text-ink">
          {marksPerMinute === null ? "—" : marksPerMinute.toFixed(1)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] font-semibold tracking-[0.1em] ${badge.chip}`}
        >
          {badge.label}
        </span>
        <EvidenceChip n={n} confidence={confidence} />
        {doomed && (
          <span className="tnum font-mono text-[9.5px] font-medium text-bad">
            {minutesSpent} MIN SPENT
          </span>
        )}
      </div>
      {/* AVG is blank when nothing has been cleared — there is no time-to-clear
          for a shape never cleared, and showing the failure time here would
          misread as "this takes 8 minutes". */}
      {clearRate === 0 && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute-400 text-pretty">
          No average time to clear, because you never have. The minutes above are what trying cost.
        </p>
      )}
    </div>
  );
}

function formatMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
