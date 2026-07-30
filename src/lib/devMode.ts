/**
 * Whether the deterministic dev-mode OTP is permitted.
 *
 * WHY THIS IS NOT JUST AN ENV-VAR CHECK — read before relaxing it.
 *
 * Dev mode replaces the SMS with a six-digit code derived deterministically from
 * the phone number (see computeDevOtp in lib/otp.ts). The salt is in this
 * repository. So on any publicly reachable deployment, dev mode means:
 *
 *     anyone can compute the OTP for any phone number and sign in as that person.
 *
 * That is unauthenticated account takeover for every user, and the only thing
 * standing in the way would be remembering to set one environment variable
 * correctly. `.env.local.example` ships `MSG91_DEV_MODE=true` because that is
 * right for localhost — which means pasting that file wholesale into a hosting
 * provider's environment settings is the single most likely deployment mistake,
 * and it would be catastrophic and silent.
 *
 * So dev mode requires BOTH the explicit flag AND a non-production build.
 * Vercel sets NODE_ENV=production for production *and* preview deployments, so
 * this closes both. The flag alone cannot open the door.
 *
 * Consequence, accepted deliberately: OTP login cannot be exercised on a
 * deployed preview URL. Preview testing needs real MSG91 credentials, which is
 * correct — a publicly reachable URL should never accept a guessable code.
 *
 * Safe in a client bundle: reads only NEXT_PUBLIC_* and NODE_ENV, both of which
 * Next inlines at build time.
 */
export function devModeAllowed(): boolean {
  // Belt-and-braces: a production build never permits it, whatever the flags say.
  if (process.env.NODE_ENV === "production") return false;

  // Server and client read different variables — the server's is authoritative,
  // but the client needs its own copy to know which UI path to take, and the two
  // are required to agree.
  const server = process.env.MSG91_DEV_MODE === "true";
  const client = process.env.NEXT_PUBLIC_MSG91_DEV_MODE === "true";
  return server || client;
}
