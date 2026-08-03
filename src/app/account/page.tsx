import Link from "next/link";
import { redirect } from "next/navigation";
import AccountActions from "./AccountActions";
import SignOutButton from "./SignOutButton";
import { CONTACT_EMAIL } from "@/lib/contact";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Account and About — design 2d.
 *
 * The design puts the product's refusals and the export/delete controls on ONE
 * dark screen, which merges what architecture.md had split into `account/` and
 * `about/`. Followed the design: "what it won't do" is the reason a sceptical
 * aspirant trusts the numbers, so it belongs next to the controls that prove the
 * data is theirs — not on a separate marketing page nobody opens.
 *
 * The refusals are rendered from a list rather than prose so each one stays a
 * discrete, checkable promise.
 */

const REFUSALS = [
  {
    title: "Rank you against other students",
    detail: "No leaderboards. Every number here is yours alone.",
  },
  {
    title: "Predict your percentile",
    detail: "Percentile is what your mock platform told you. We only record it.",
  },
  {
    title: "Host or sell exam questions",
    detail: "No shared question bank, ever. Your material stays yours.",
  },
  {
    title: "Claim more than the data supports",
    detail: "Every insight shows its sample size. Below threshold, we stay quiet.",
  },
];

export default async function AccountPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("name, target_exam, target_year, target_percentile, prep_mode")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/profile");

  // Only completed mocks are counted, matching what the insight screens use — so
  // the number here can never disagree with the number on home.
  const { count } = await supabase
    .from("mock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("is_complete", true);

  const mockCount = count ?? 0;

  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-ink px-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[20px] font-semibold tracking-[0.3em] text-paper">
            ASHA
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-mute-500">
            VERSION 1.0 · {profile.target_exam} {profile.target_year}
          </div>
        </div>
        <Link href="/" className="font-mono text-[11px] font-medium text-brass">
          CLOSE
        </Link>
      </div>

      <p className="mt-6 text-[17px] leading-snug text-paper text-pretty">
        An instrument, not a teacher. It reads your own mock data and tells you where you stand.
      </p>

      <div className="my-5 h-px bg-paper/[0.14]" />

      {/* Who this account is. Short, because the profile is four fields. */}
      <div className="flex flex-col gap-1.5">
        <Row label="NAME" value={profile.name} />
        <Row
          label="PREPARING"
          value={
            profile.prep_mode === "classroom"
              ? "Coaching"
              : profile.prep_mode === "online"
                ? "Online"
                : profile.prep_mode === "self-study"
                  ? "Self-study"
                  : "Not set"
          }
        />
        <Row
          label="TARGET"
          value={
            profile.target_percentile === null
              ? "Not set"
              : `${profile.target_percentile} %ile — tracked, never predicted`
          }
        />
        <Row label="LOGGED" value={`${mockCount} ${mockCount === 1 ? "mock" : "mocks"}`} />
      </div>

      <div className="my-5 h-px bg-paper/[0.14]" />

      <div className="font-mono text-[10px] font-medium tracking-[0.16em] text-brass">
        WHAT ASHA WILL NEVER DO
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {REFUSALS.map((r) => (
          <div key={r.title} className="flex gap-2.5">
            <span className="font-mono text-[13px] leading-tight text-bad" aria-hidden="true">
              ✕
            </span>
            <div>
              <div className="text-[13.5px] font-semibold leading-snug text-paper text-pretty">
                {r.title}
              </div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-mute-500 text-pretty">
                {r.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="my-5 h-px bg-paper/[0.14]" />

      <AccountActions mockCount={mockCount} />

      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/help"
          className="flex items-center justify-between rounded-xl border border-paper/[0.16] px-4 py-3"
        >
          <span className="text-[13.5px] font-medium text-paper">Help</span>
          <span className="font-mono text-[11px] text-mute-500">
            WHAT A NUMBER MEANS, WHY SOMETHING&rsquo;S LOCKED
          </span>
        </Link>
        <SignOutButton />
      </div>

      {/* Real links. These were <span>s — three words that looked like navigation
          and did nothing, on the same screen as a working permanent-delete
          button. For a product whose argument is trustworthiness, that was the
          worst place in the app to have fake affordances. */}
      <div className="mt-auto flex gap-4 pt-6 font-mono text-[11px] text-[#6B6659]">
        <Link href="/privacy" className="underline decoration-[#6B6659]/40">
          PRIVACY
        </Link>
        <Link href="/terms" className="underline decoration-[#6B6659]/40">
          TERMS
        </Link>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="underline decoration-[#6B6659]/40"
        >
          CONTACT
        </a>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
        {label}
      </span>
      <span className="text-right text-[13px] text-paper">{value}</span>
    </div>
  );
}
