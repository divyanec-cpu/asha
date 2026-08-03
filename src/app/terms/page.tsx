import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

/**
 * Terms of use — public, no auth check.
 *
 * This page exists because the login screen already says "By continuing you agree
 * to our terms", which was a promise with nothing behind it. Deliberately short:
 * ASHA takes no payment, hosts no user-to-user interaction and holds no exam
 * content, so most of what a long terms document usually covers does not apply
 * here, and padding it out would only bury the parts that do.
 *
 * Same standing as the privacy policy: a good-faith plain-language draft, with
 * real legal review still a pre-launch item (CLAUDE.md).
 */

const LAST_UPDATED = "3 August 2026";

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What you are agreeing to",
    body:
      "ASHA is a tool for analysing your own mock-test performance. It is free, early, and under active development. By signing in you agree to use it as described here.",
  },
  {
    heading: "Adults only",
    body:
      "You must be 18 or older. ASHA has no parental-consent route and is not designed for minors. If you are under 18, do not create an account.",
  },
  {
    heading: "ASHA does not promise you a better score",
    body:
      "It is an instrument, not a coach and not a guarantee. It reports what your own data shows and tells you how much data each statement rests on. Whether your score improves depends on your preparation, not on this app, and nothing here should be read as a prediction of your result.",
  },
  {
    heading: "It will never predict your percentile",
    body:
      "A percentile depends on everyone else who sat the paper, which ASHA has no knowledge of. Any percentile you see is the one you entered from your mock platform, stored exactly as you typed it.",
  },
  {
    heading: "The output is only as good as what you enter",
    body:
      "Every reading is computed from the data you log, including your own judgements — how confident you felt, why an answer went wrong, whether a set you skipped was winnable. Those judgements are yours and ASHA takes them at face value. If they are careless, the readings built on them will be wrong in ways ASHA cannot detect.",
  },
  {
    heading: "Do not put exam content into ASHA",
    body:
      "There is no upload feature and no question bank, by design — exam papers are copyrighted, and ASHA stays clear of them deliberately. Please do not paste question text into the notes field either. Record how you performed, not the material.",
  },
  {
    heading: "Your data stays yours",
    body:
      "You can export everything or delete your account permanently at any time, from the account screen, without asking anyone. See the privacy policy for what is held and who processes it.",
  },
  {
    heading: "No warranty",
    body:
      "ASHA is provided as it is, without guarantees that it will be available, uninterrupted, or free of errors. It is not professional or educational advice, and decisions about your preparation remain yours.",
  },
  {
    heading: "This may change or stop",
    body:
      "Features may change and the service may be discontinued. If that happens you will be given reasonable notice and the chance to export your data first. Meaningful changes to these terms update the date above.",
  },
  {
    heading: "Governing law and contact",
    body:
      `These terms are governed by the laws of India. Questions go to ${CONTACT_EMAIL}, a personal address used during the trial period.`,
  },
];

export default function TermsPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="safe-top bg-ink px-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] font-semibold tracking-[0.24em] text-brass">
              TERMS OF USE
            </div>
            <p className="mt-1.5 text-[12.5px] text-mute-300">Last updated {LAST_UPDATED}</p>
          </div>
          <Link href="/account" className="shrink-0 font-mono text-[11px] font-medium text-brass">
            CLOSE
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-8 pt-4">
        <p className="text-[14px] leading-relaxed text-ink text-pretty">
          Short, because ASHA takes no payment, has no social features and holds no exam content.
          Most of what these documents usually cover simply doesn&rsquo;t apply.
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
          href="/privacy"
          className="mt-5 text-center font-mono text-[11px] font-medium text-brass"
        >
          ← PRIVACY POLICY
        </Link>
      </div>
    </main>
  );
}
