/*
  Placeholder. This route becomes the session gate in Phase 2 — signed in and
  profiled → home; signed in without a profile → profile setup; otherwise the
  auth flow (design screens 2a → 2b).

  It exists now only so `next dev` and `next build` have an entry point while
  the database is being seeded.
*/
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-ink px-7">
      <div>
        <div className="font-mono text-2xl font-semibold tracking-[0.35em] text-paper">
          ASHA
        </div>
        <div className="mt-3 h-0.5 w-11 bg-brass" />
      </div>

      <p className="text-xl leading-snug text-paper text-pretty">
        You&rsquo;ve taken the mock.
        <br />
        Now find out where you stand.
      </p>

      <p className="font-mono text-xs tracking-wide text-mute-500">
        SCAFFOLD ONLY · NOT WIRED UP YET
      </p>
    </main>
  );
}
