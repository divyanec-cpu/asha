import "server-only";

/**
 * Server-side MSG91 OTP Widget verification.
 *
 * In real mode the widget runs entirely client-side (send, retry, verify,
 * hCaptcha) and hands the browser a JWT access token on success. The ONLY thing
 * the server trusts is MSG91's own server-to-server confirmation of that token,
 * and the phone number is extracted from the validated token — never taken from
 * the client's request body. A token proving "some number was verified" must not
 * let a caller claim a different number.
 */

const VERIFY_URL = "https://control.msg91.com/api/v5/widget/verifyAccessToken";

/**
 * Decode a JWT payload without verifying its signature. Safe here ONLY because
 * MSG91 has just confirmed the token's validity server-to-server, immediately
 * before this is called. Do not reuse this helper anywhere that confirmation
 * hasn't happened.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractIdentifier(payload: Record<string, unknown>): string | null {
  for (const key of ["identifier", "mobile", "phone", "identity"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    // Some MSG91 payloads nest the request data one level down.
    if (value && typeof value === "object") {
      const nested = extractIdentifier(value as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Normalize an MSG91 identifier ("919876543210", "+91 98765 43210", …) to E.164.
 * Returns null for anything that isn't a 10-digit Indian mobile once the country
 * code is stripped.
 */
function normalizeIndianPhone(identifier: string): string | null {
  let digits = identifier.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `+91${digits}`;
}

/**
 * Confirms a widget access token with MSG91 and returns the verified phone in
 * E.164 form, or null if the token is invalid or expired, or the identifier
 * can't be established.
 */
export async function verifyWidgetAccessToken(accessToken: string): Promise<string | null> {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    console.error("[msg91] MSG91_AUTH_KEY is not set");
    return null;
  }

  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: authKey, "access-token": accessToken }),
    });
  } catch (err) {
    console.error("[msg91] verifyAccessToken request failed:", err);
    return null;
  }

  let body: { type?: string; message?: unknown } | null = null;
  try {
    body = await response.json();
  } catch {
    // Fall through — treated as a failure below.
  }
  if (!response.ok || body?.type !== "success") {
    return null;
  }

  // Identifier: prefer the validated token's own payload, then fall back to the
  // response message, which sometimes carries a JWT and sometimes the raw value.
  let identifier: string | null = null;
  const tokenPayload = decodeJwtPayload(accessToken);
  if (tokenPayload) identifier = extractIdentifier(tokenPayload);
  if (!identifier && typeof body.message === "string") {
    const messagePayload = decodeJwtPayload(body.message);
    if (messagePayload) identifier = extractIdentifier(messagePayload);
    else identifier = body.message;
  }
  if (!identifier) {
    // Diagnosis aid if MSG91's payload shape changes. Logs KEYS ONLY, never
    // values — this payload contains a phone number.
    console.error(
      "[msg91] token valid but no identifier found; payload keys:",
      tokenPayload ? Object.keys(tokenPayload) : "(undecodable token)",
    );
    return null;
  }

  const phone = normalizeIndianPhone(identifier);
  if (!phone) {
    console.error("[msg91] identifier did not normalize to an Indian mobile");
    return null;
  }
  return phone;
}
