import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

/**
 * Public privacy policy — deliberately no auth check, so it is readable by
 * someone deciding whether to sign up at all, and usable as the policy URL a
 * store listing will eventually require.
 *
 * Good-faith plain-language draft written against the actual schema, not a
 * template. A real legal review remains a separate pre-launch item (CLAUDE.md),
 * and the contact address is the builder's personal one until a dedicated
 * support address exists.
 *
 * Keep LAST_UPDATED current on edits. It is the only thing telling a reader
 * whether what they're looking at is stale.
 */

const LAST_UPDATED = "3 August 2026";

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What ASHA is",
    body:
      "ASHA is an analytics companion for people preparing for CAT. It does not teach, does not sell mock tests, and does not rank you against anyone. You take your mocks wherever you already take them — your coaching institute, SimCAT, AIMCAT, past papers — and ASHA reads the attempt data you enter to tell you where you stand and what to change before the next one.",
  },
  {
    heading: "Who can use it",
    body:
      "Adults only. ASHA is not for anyone under 18, and there is no parental-consent route into it — if you are under 18, do not create an account. There is no invite system and no linked-account structure of any kind: every account stands alone and sees only its own data.",
  },
  {
    heading: "What we collect",
    body:
      "Your phone number, used to sign you in. Your name as you choose to give it, your target exam and year, how you are preparing, and optionally a target percentile. Then the mock data you enter: which mock it was and when you took it, the total and section scores and the percentile your mock platform reported, every DILR set including the ones you never opened, and for each question its type, whether you got it right, how confident you felt before checking, roughly how long it took, and — when it went wrong — why. Plus anything you type into the notes field. We collect nothing a feature does not need: no location, no contacts, no device identifiers, no browsing activity.",
  },
  {
    heading: "What we deliberately do not hold",
    body:
      "No exam questions. ASHA never stores, uploads or reproduces the content of any mock or past paper — there is no upload feature and no shared question bank, and there never will be. What ASHA holds is your record of how you performed, not the material you performed on. Timings are your own recollection entered in rough buckets, never captured measurements, and every screen built on them says so.",
  },
  {
    heading: "No AI, and no training on your data",
    body:
      "ASHA sends nothing to any AI service. Every number it shows you is arithmetic over the rows you entered, computed on our own servers. Your data is not used to train any model, by us or by anyone else, because it never reaches one.",
  },
  {
    heading: "Who can see your data",
    body:
      "Only you. Access is enforced at the database level, per row, so one account physically cannot read another's — not by accident and not by a mistake in application code. There are no leaderboards, no rankings, no comparisons between users, and no behavioural profiling. ASHA carries no advertising and no advertising or analytics tracking code.",
  },
  {
    heading: "Who else handles this data",
    body:
      "Three service providers, each processing data strictly to run the app and none permitted to use it for their own purposes: Supabase (database and login), MSG91 (sends your one-time login code by SMS), and Vercel (hosting). Your phone number is the only thing MSG91 receives.",
  },
  {
    heading: "Your rights: export and delete",
    body:
      "Both work today, from the account screen, without emailing anyone. Export gives you everything ASHA holds — as a spreadsheet-ready CSV or as complete JSON, your choice. Delete removes your profile, every mock, every set and every question you have logged, and the login itself. It is immediate, permanent, and we keep no copy.",
  },
  {
    heading: "How long we keep it",
    body:
      "Until you delete it. There is no scheduled purge and no archival copy — while your account exists, your data exists; when you delete it, it is gone.",
  },
  {
    heading: "Questions or complaints",
    body:
      `Write to ${CONTACT_EMAIL}. This is a personal address used during the trial period; a dedicated support address will replace it before any public launch.`,
  },
  {
    heading: "Changes to this policy",
    body:
      "If this policy changes in a way that matters, the last-updated date above changes with it. ASHA is early and under active development, so this will happen.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
              PRIVACY
            </div>
            <p className="mt-1.5 text-[12.5px] text-mute-300">
              Last updated {LAST_UPDATED}
            </p>
          </div>
          <Link href="/account" className="shrink-0 font-mono text-[11px] font-medium text-brass">
            CLOSE
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-8 pt-4">
        <p className="text-[14px] leading-relaxed text-ink text-pretty">
          Written in plain language rather than legal boilerplate, because a policy nobody reads
          protects nobody.
        </p>

        <div className="mt-2 flex flex-col">
          {SECTIONS.map((section) => (
            <section key={section.heading} className="border-b border-ink/[0.09] py-3.5">
              <h2 className="font-mono text-[10px] font-medium tracking-[0.14em] text-mute-500">
                {section.heading.toUpperCase()}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#4A463D] text-pretty">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <Link
          href="/terms"
          className="mt-5 text-center font-mono text-[11px] font-medium text-brass"
        >
          TERMS OF USE →
        </Link>
      </div>
    </main>
  );
}
