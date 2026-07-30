import { createHash } from "crypto";
import { devModeAllowed } from "./devMode";

/**
 * Server-side OTP helpers.
 *
 * Dev mode: no SMS is sent. The code is derived deterministically from the phone
 * number, so the same number always gets the same six digits, printed to the
 * server console by /api/otp/send.
 *
 * This is the ONLY OTP path that works on localhost. The real MSG91 widget runs
 * hCaptcha internally and hCaptcha refuses to run on localhost — a Dhruva
 * finding, not a guess. Real mode therefore only works on a deployed HTTPS
 * domain.
 */

/**
 * Gated on more than the env flag — see lib/devMode.ts. A deterministic OTP on a
 * public URL is unauthenticated account takeover for every user, so a production
 * build refuses it regardless of how the environment is configured.
 */
export function isDevMode(): boolean {
  return devModeAllowed();
}

/** Deterministic six-digit dev code for a 10-digit phone number. */
export function computeDevOtp(phone: string): string {
  // Salted with the project name so a number's dev code differs between ASHA
  // and Dhruva — the two run on the same machine in dev.
  const digest = createHash("sha256").update(`asha-dev-otp:${phone}`).digest("hex");
  const n = parseInt(digest.slice(0, 6), 16) % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * RESERVED — intentionally empty. No synthetic test numbers are reserved yet
 * (builder's decision, 2026-07-29), so in dev mode any number works.
 *
 * The check is wired into /api/otp/verify's real-mode path already, so
 * reserving one later is a one-line change here.
 *
 * The rule this enforces, when it is populated: a made-up-looking Indian mobile
 * cannot be confirmed unassigned. If a reserved number turns out to be real,
 * its owner could complete a genuine MSG91 SMS verification and land inside the
 * test account's data. So reserved numbers must be reachable only through
 * localhost's deterministic dev code, never through real SMS.
 */
const RESERVED_TEST_PHONES = new Set<string>([]);

export function isReservedTestPhone(phone: string): boolean {
  return RESERVED_TEST_PHONES.has(phone);
}
