import Link from "next/link";

/**
 * The four-tab bottom navigation from the design: HOME / PLAYBOOK / TRENDS / LOG.
 *
 * LOG is the brass circle rather than a fourth flat tab, because logging a mock
 * is the only action in the product — everything else is reading. Time-to-logged
 * mock is the product metric, so the one thing that moves it gets the affordance.
 */

type Tab = "home" | "playbook" | "trends";

const TABS: { id: Tab; href: string; glyph: string; label: string }[] = [
  { id: "home", href: "/", glyph: "◈", label: "HOME" },
  { id: "playbook", href: "/playbook", glyph: "▤", label: "PLAYBOOK" },
  { id: "trends", href: "/trends", glyph: "◔", label: "TRENDS" },
];

export default function BottomNav({ active }: { active: Tab }) {
  return (
    // safe-bottom rather than pb-3.5: on an installed iOS PWA the home-indicator
    // area sits below the viewport edge, and without the inset the LOG button
    // ends up under it.
    <nav className="safe-bottom flex flex-none border-t border-ink/[0.09] px-2 pt-2.5">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span
              className={`font-mono text-[15px] ${on ? "text-ink" : "text-mute-400"}`}
              aria-hidden="true"
            >
              {t.glyph}
            </span>
            <span
              className={`font-mono text-[9.5px] tracking-[0.08em] ${
                on ? "font-semibold text-ink" : "font-medium text-mute-400"
              }`}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
      <Link href="/log" className="flex flex-1 flex-col items-center gap-1">
        <span className="-mt-[3px] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brass font-mono text-[17px] text-white">
          +
        </span>
        <span className="font-mono text-[9.5px] font-semibold tracking-[0.08em] text-ink">LOG</span>
      </Link>
    </nav>
  );
}
