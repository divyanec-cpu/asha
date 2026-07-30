import type { ConfidenceLabel } from "@/lib/thresholds";

/**
 * The insight presentation primitives.
 *
 * LockedCard is the most important component in the app. Below its evidence
 * threshold an insight is not shown at all — instead the card states what is
 * missing, which is itself useful ("3 more Games & Tournaments sets before this
 * is reliable"). The scarcity IS the honesty argument, made visible, and it is
 * the thing that costs the product something: a newer user sees less. That cost
 * is accepted deliberately (decisions.md), because one confidently-wrong claim
 * built on n=2 destroys trust with exactly the sceptical user this is built for.
 *
 * Every one of these renders through the same component so the treatment can
 * never drift between screens.
 */

/** Dashed border, muted, no numbers. Nothing here may look like a measurement. */
export function LockedCard({
  title,
  message,
  progress,
}: {
  title: string;
  message: string;
  /** Optional n / needed, shown as a bar. Never rendered as a claim. */
  progress?: { have: number; needed: number };
}) {
  const pct =
    progress && progress.needed > 0
      ? Math.min(100, Math.round((progress.have / progress.needed) * 100))
      : null;

  return (
    <div className="rounded-[14px] border border-dashed border-ink/20 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#6B6659]">{title}</span>
        {progress && (
          <span className="tnum shrink-0 font-mono text-[10.5px] font-medium text-mute-400">
            {progress.have}/{progress.needed}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-mute-400 text-pretty">{message}</p>
      {pct !== null && (
        <div className="mt-2.5 flex gap-1">
          <span className="h-1 rounded-sm bg-brass" style={{ flex: Math.max(pct, 2) }} />
          <span className="h-1 rounded-sm bg-ink/[0.14]" style={{ flex: Math.max(100 - pct, 2) }} />
        </div>
      )}
    </div>
  );
}

/**
 * The evidence chip that rides on every live claim: sample size and confidence.
 *
 * Not decoration. Positioning rule 3 — every insight carries the sample size it
 * rests on — and the target user will reasonably ask "on what basis?".
 */
export function EvidenceChip({
  n,
  confidence,
  section,
}: {
  n: number;
  confidence: ConfidenceLabel;
  section?: { label: string; tone: "ink" | "bad" | "brass" };
}) {
  const sectionTone =
    section?.tone === "bad"
      ? "bg-bad text-white"
      : section?.tone === "brass"
        ? "bg-brass text-white"
        : "bg-ink text-white";

  return (
    <div className="flex items-center gap-1.5">
      {section && (
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em] ${sectionTone}`}
        >
          {section.label}
        </span>
      )}
      <span className="tnum font-mono text-[9.5px] font-medium tracking-[0.02em] text-mute-500">
        n={n} · {confidence.toUpperCase()}
      </span>
    </div>
  );
}

/** A live insight on the dark ink surface — used for the single most important
 *  finding on a screen. */
export function InsightCardDark({
  eyebrow,
  headline,
  rationale,
  children,
}: {
  eyebrow?: React.ReactNode;
  headline: string;
  rationale?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] bg-ink px-4 py-3.5">
      {eyebrow}
      <div className="mt-1.5 text-[16.5px] font-semibold leading-snug text-paper text-pretty">
        {headline}
      </div>
      {rationale && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-300 text-pretty">
          {rationale}
        </p>
      )}
      {children}
    </div>
  );
}

/** A live insight on paper — the secondary treatment. */
export function InsightCard({
  eyebrow,
  headline,
  rationale,
  children,
}: {
  eyebrow?: React.ReactNode;
  headline: string;
  rationale?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-ink/[0.1] bg-white px-4 py-3.5">
      {eyebrow}
      <div className="mt-1.5 text-[15.5px] font-semibold leading-snug text-ink text-pretty">
        {headline}
      </div>
      {rationale && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B6659] text-pretty">{rationale}</p>
      )}
      {children}
    </div>
  );
}

/** Section eyebrow label, mono and letterspaced. */
export function Eyebrow({
  children,
  tone = "paper",
}: {
  children: React.ReactNode;
  tone?: "paper" | "ink" | "brass";
}) {
  const colour =
    tone === "ink" ? "text-mute-500" : tone === "brass" ? "text-brass" : "text-mute-500";
  return (
    <div className={`font-mono text-[10.5px] font-medium tracking-[0.16em] ${colour}`}>
      {children}
    </div>
  );
}
