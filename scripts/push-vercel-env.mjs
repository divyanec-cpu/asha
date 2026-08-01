/**
 * push-vercel-env.mjs — upload the environment variables ASHA needs to Vercel,
 * read from the local .env.local.
 *
 *   node scripts/push-vercel-env.mjs            # dry run, prints what it would do
 *   node scripts/push-vercel-env.mjs --apply    # actually uploads
 *
 * WHY A SCRIPT. Ten variables typed by hand into a web form is ten chances to
 * paste a truncated key, and a truncated service-role key fails at runtime with
 * an error that looks nothing like its cause. This reads the values that already
 * work locally.
 *
 * WHAT IT REFUSES TO UPLOAD, and this is the point:
 *
 *   MSG91_DEV_MODE, NEXT_PUBLIC_MSG91_DEV_MODE
 *
 * Dev mode replaces the SMS with a code derived deterministically from the phone
 * number, and the salt is in this repository — so on a public URL it means anyone
 * can compute the OTP for any number and sign in as that person. `.env.local`
 * sets both to `true` because that is correct for localhost, which makes
 * "upload .env.local to the host" the natural and catastrophic mistake. This
 * script exists partly to make that mistake impossible to make by accident.
 *
 * (lib/devMode.ts also refuses dev mode in any production build, and a test pins
 * that. Two independent guards, because one of them is a single `if`.)
 *
 * VERCEL_OIDC_TOKEN is skipped too: `vercel link` writes it into .env.local for
 * local use and Vercel injects its own at runtime.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");

/** Variables the deployed app needs. Anything not listed is not uploaded. */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MSG91_AUTH_KEY",
  "NEXT_PUBLIC_MSG91_WIDGET_ID",
  "NEXT_PUBLIC_MSG91_TOKEN_AUTH",
];

/** Never upload these, whatever .env.local says. See the header. */
const FORBIDDEN = new Set([
  "MSG91_DEV_MODE",
  "NEXT_PUBLIC_MSG91_DEV_MODE",
  "VERCEL_OIDC_TOKEN",
]);

const TARGETS = ["production", "preview"];

function parseEnvFile(path) {
  const out = new Map();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== "") out.set(key, value);
  }
  return out;
}

/** Show enough to recognise a value, never enough to leak it. */
const mask = (v) =>
  v.length <= 12 ? `${v.slice(0, 2)}…${v.slice(-2)}` : `${v.slice(0, 8)}…${v.slice(-4)} (${v.length} chars)`;

let env;
try {
  env = parseEnvFile(".env.local");
} catch {
  console.error("\n  Could not read .env.local. Run this from the repo root.\n");
  process.exit(1);
}

const missing = REQUIRED.filter((k) => !env.has(k));
if (missing.length) {
  console.error("\n  .env.local is missing values for:\n");
  for (const k of missing) console.error(`    ${k}`);
  console.error("\n  Fill them in locally first — the deployed app needs all of them.\n");
  process.exit(1);
}

console.log(`\n${APPLY ? "UPLOADING" : "DRY RUN — nothing will be uploaded"}\n`);
console.log("  will upload to production + preview:");
for (const k of REQUIRED) console.log(`    ${k.padEnd(32)} ${mask(env.get(k))}`);

const skipped = [...env.keys()].filter((k) => FORBIDDEN.has(k));
if (skipped.length) {
  console.log("\n  deliberately NOT uploaded:");
  for (const k of skipped) {
    const why = k === "VERCEL_OIDC_TOKEN" ? "Vercel injects its own" : "would allow account takeover on a public URL";
    console.log(`    ${k.padEnd(32)} ${why}`);
  }
}

const ignored = [...env.keys()].filter((k) => !REQUIRED.includes(k) && !FORBIDDEN.has(k));
if (ignored.length) {
  console.log("\n  not in the required list, ignored:");
  for (const k of ignored) console.log(`    ${k}`);
}

if (!APPLY) {
  console.log("\n  Re-run with --apply to upload.\n");
  process.exit(0);
}

console.log("");

/** Blocking sleep — this is a sequential CLI script, so no event loop to yield to. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Retries with backoff.
 *
 * The first real run of this script set all seven variables on production and
 * silently set NONE on preview — fourteen API calls in about a minute, which
 * Vercel appears to rate-limit. Re-running the identical code path later worked
 * for both targets, so the calls are correct and the failure was transient. That
 * is precisely the failure a one-shot loop hides: production looks fine, preview
 * is quietly empty, and nothing complains until a preview deployment breaks.
 */
function runWithRetry(args, input, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = spawnSync("npx", args, { input, encoding: "utf8", shell: true });
    if (last.status === 0) return { ...last, attempt };
    if (attempt < attempts) sleep(attempt * 2000);
  }
  return { ...last, attempt: attempts };
}

let failures = 0;

for (const key of REQUIRED) {
  const value = env.get(key);
  for (const target of TARGETS) {
    // Remove first so re-running is idempotent rather than erroring on conflict.
    spawnSync("npx", ["vercel", "env", "rm", key, target, "--yes"], {
      stdio: "ignore",
      shell: true,
    });

    const res = runWithRetry(["vercel", "env", "add", key, target], `${value}\n`);
    const ok = res.status === 0;
    if (!ok) failures++;

    const retried = res.attempt > 1 ? ` (after ${res.attempt} attempts)` : "";
    const why = ok ? "" : `  ${(res.stderr || res.stdout || "").trim().split("\n").pop()}`;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${key} → ${target}${retried}${why}`);

    // Deliberate pacing between calls, for the same reason as the retry.
    sleep(400);
  }
}

// Verify against Vercel rather than trusting the exit codes — the whole point of
// this section is that the first run reported nothing wrong.
console.log("\n  verifying against Vercel...");
const ls = spawnSync("npx", ["vercel", "env", "ls"], { encoding: "utf8", shell: true });
const listed = ls.stdout ?? "";
const absent = [];
for (const key of REQUIRED) {
  for (const target of TARGETS) {
    const row = new RegExp(`^\\s*${key}\\s+\\S+\\s+.*${target}`, "im");
    if (!row.test(listed)) absent.push(`${key} → ${target}`);
  }
}

if (absent.length) {
  console.log("\n  NOT PRESENT on Vercel after upload:");
  for (const m of absent) console.log(`    ${m}`);
  console.log("\n  Re-run this script; the failure is usually transient.\n");
  process.exit(1);
}

console.log(
  failures === 0
    ? "\n  All variables present on production and preview.\n" +
        "  Redeploy for them to take effect:  npx vercel --prod\n"
    : `\n  ${failures} operation(s) failed — see above.\n`,
);
process.exit(failures === 0 ? 0 : 1);
