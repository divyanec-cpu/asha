import Link from "next/link";
import { MIN_INSTANCES, UNITS, type InsightKind } from "@/lib/thresholds";

/**
 * Help — design 2c.
 *
 * Organised around the two things people actually get stuck on: what a number
 * means, and why something is still locked. That framing is the design's, and
 * it's right — every other question about this app is answered by the app.
 *
 * TWO DEVIATIONS FROM THE MOCKUP:
 *
 * 1. The threshold table is GENERATED from lib/thresholds.ts rather than typed
 *    out. Those numbers are published so a sceptical user can check them
 *    (data-model.md), and a hand-written copy would eventually contradict the
 *    code — which is the one thing a page about trustworthiness cannot do.
 *
 * 2. No search box. The design draws one, but over this many entries a search
 *    field is decoration, and a non-functional one actively erodes the trust
 *    this page exists to build. Everything is on one screen instead.
 */

const THRESHOLD_ORDER: { kind: InsightKind; label: string }[] = [
  { kind: "set_selection", label: "A verdict on a DILR set shape" },
  { kind: "skip_regret", label: "Skip regret" },
  { kind: "time_trap", label: "A time trap on a question type" },
  { kind: "quadrant", label: "Speed-vs-accuracy placement" },
  { kind: "calibration", label: "Confidence calibration" },
  { kind: "error_cause", label: "Error causes for a section" },
  { kind: "pacing", label: "Pacing across the section clock" },
];

const FAQS: { group: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    group: "LOGGING A MOCK",
    items: [
      {
        q: "Why log sets I never opened?",
        a: (
          <>
            Because that&rsquo;s where the marks are. With five DILR sets and time for maybe three,
            your score comes from <em>picking</em> correctly, not from solving faster. A set you
            walked past that you&rsquo;d have cleared is the single most useful thing you can tell
            ASHA &mdash; and it&rsquo;s invisible unless you log it. The sets you ignored are the ones
            that teach us something.
          </>
        ),
      },
      {
        q: "I don't remember my exact timings",
        a: (
          <>
            You&rsquo;re not meant to. Time is entered in rough buckets, and every attempt is marked
            as your own recollection rather than a measurement. Every screen built on timing says so.
            ASHA will never present a recalled estimate as if it were stopwatch data.
          </>
        ),
      },
      {
        q: "Can I finish a half-logged mock later?",
        a: (
          <>
            Yes, and it&rsquo;s expected. Each section saves as you go, and an unfinished mock sits at
            the top of your log until you come back to it. An unfinished mock doesn&rsquo;t count
            towards any reading &mdash; a half-logged section would drag your averages down and make
            you look like you&rsquo;d gone backwards.
          </>
        ),
      },
      {
        q: "What's the difference between the two ways of logging?",
        a: (
          <>
            <strong>Batch</strong> assumes everything was right and asks you to tap only the
            exceptions &mdash; fastest for a section that went well. <strong>Card by card</strong>
            {" "}walks every question. The trade-off is real: batch only records how sure you felt on
            the questions you flagged, so the calibration reading takes longer to unlock. ASHA
            won&rsquo;t guess a confidence you didn&rsquo;t give it.
          </>
        ),
      },
      {
        q: "Can I upload my mock PDF?",
        a: (
          <>
            No, and not by oversight. Exam papers are copyrighted, and whether uploading one you
            bought into a private tool is defensible is a real legal question we haven&rsquo;t had
            answered yet. Everything here works from manually entered attempt data, which needs no
            upload at all.
          </>
        ),
      },
    ],
  },
  {
    group: "READING THE NUMBERS",
    items: [
      {
        q: "What does marks-per-minute mean?",
        a: (
          <>
            Marks earned on a set shape divided by the minutes you spent on it &mdash; including the
            attempts that failed, because that time was spent either way. It&rsquo;s how the playbook
            ranks shapes: a shape you clear reliably in nine minutes is worth more than one you clear
            in fourteen, even at the same success rate.
          </>
        ),
      },
      {
        q: "Low, medium and high confidence",
        a: (
          <>
            How much data a claim rests on, relative to its minimum. At the minimum it&rsquo;s{" "}
            <strong>low</strong>; at twice the minimum <strong>medium</strong>; at three times{" "}
            <strong>high</strong>. Every claim shows its own sample size next to it, so you can
            always check the basis rather than take our word for it.
          </>
        ),
      },
      {
        q: "Why won't ASHA predict my percentile?",
        a: (
          <>
            Because it can&rsquo;t, and pretending otherwise would be the fastest way to make
            everything else here untrustworthy. A percentile depends on who else sat the paper, which
            is information ASHA has none of. The percentile you see is the one your mock platform gave
            you, recorded exactly as you entered it.
          </>
        ),
      },
      {
        q: "Why does the trend view refuse to draw a line?",
        a: (
          <>
            Because your scores come from different mock providers, which aren&rsquo;t scaled the same
            way, and a dozen readings across four providers can&rsquo;t support a slope. The band shows
            where your scores actually sit. A line would look more informative and be less true.
          </>
        ),
      },
      {
        q: "Guessing — is it worth it?",
        a: (
          <>
            It depends on the question. On a negatively-marked multiple-choice question, guessing only
            pays if you&rsquo;re right more than a quarter of the time. On a type-in-the-answer
            question there&rsquo;s no penalty at all, so leaving one blank gives away free marks. ASHA
            works this out from your own tagged guesses and the actual marking scheme &mdash; and if
            the effect is small, it says so instead of dramatising it.
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
              HELP
            </div>
            <p className="mt-1.5 text-[12.5px] text-mute-300">
              Short answers. Ask us anything else.
            </p>
          </div>
          <Link href="/account" className="font-mono text-[11px] font-medium text-brass">
            CLOSE
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4">
        {/* The question this page mostly exists to answer. */}
        <section className="flex flex-col gap-2">
          <SectionLabel>WHY IS THIS LOCKED?</SectionLabel>
          <div className="rounded-[13px] bg-ink px-4 py-3.5">
            <div className="text-[15px] font-semibold leading-snug text-paper text-pretty">
              Every claim needs a minimum number of observations.
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
              Below that we&rsquo;d be guessing, so we say nothing instead and tell you what&rsquo;s
              missing. It means a newer account sees less, which we&rsquo;d rather do than show you one
              confident number built on two data points.
            </p>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-paper/[0.14] pt-3">
              {THRESHOLD_ORDER.map(({ kind, label }) => (
                <div key={kind} className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-paper">{label}</span>
                  <span className="tnum shrink-0 text-right font-mono text-[10.5px] font-medium text-brass">
                    {MIN_INSTANCES[kind]} {UNITS[kind]}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#6B6659] text-pretty">
              These come straight from the app&rsquo;s own configuration, not from a page someone
              remembered to update.
            </p>
          </div>
        </section>

        {FAQS.map((group) => (
          <section key={group.group} className="flex flex-col gap-2">
            <SectionLabel>{group.group}</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-[11px] border border-ink/[0.1] bg-white px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium text-ink">{item.q}</span>
                    <span className="font-mono text-[13px] text-mute-400 group-open:hidden">›</span>
                    <span className="hidden font-mono text-[13px] text-mute-400 group-open:inline">
                      ⌄
                    </span>
                  </summary>
                  <div className="mt-2.5 border-t border-ink/[0.08] pt-2.5 text-[12.5px] leading-relaxed text-[#6B6659] text-pretty">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-auto pb-6 pt-2">
          <div className="rounded-xl border border-brass/45 bg-brass/[0.08] px-4 py-3.5">
            <div className="text-[13.5px] font-semibold text-ink">Still stuck? Write to us.</div>
            <div className="mt-0.5 text-[12px] text-[#6B6659]">We answer within a day.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
      {children}
    </div>
  );
}
