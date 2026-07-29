import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyWidgetAccessToken } from "@/lib/msg91";
import { computeDevOtp, isDevMode, isReservedTestPhone } from "@/lib/otp";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service";

/**
 * Verifies the OTP, then arranges a real Supabase session for the phone user.
 *
 * WHY THIS LOOKS ODD. Supabase has no server-side session API for phone users —
 * admin.generateLink is email-only. Dhruva established the working mechanism,
 * and its notes record that server-side setSession and token-handoff variants
 * were both tried and both failed to persist cookies. So:
 *
 *   1. Verify the OTP.
 *   2. Find or create the auth user for that phone.
 *   3. Set a fresh 256-bit random password on it.
 *   4. Hand that password to the browser, once, over HTTPS.
 *   5. The browser runs a normal signInWithPassword — its native login path,
 *      which persists session cookies correctly.
 *
 * It is safe because the password is high-entropy, single-use in practice,
 * stored nowhere else, and only ever returned to a caller who has just proven
 * control of the phone number.
 *
 * The password is deliberately NOT rotated after sign-in: Supabase revokes a
 * user's sessions on an admin password change, so rotating logs the user
 * straight back out (verified live on Dhruva). It simply stays until the next
 * login overwrites it.
 *
 * Side benefit: the sign-in originates from the user's real IP, so Supabase's
 * per-IP auth rate limit applies per user naturally.
 *
 * Two verification paths share one bootstrap:
 *   - Dev mode ({ phone, code }): deterministic code, localhost only.
 *   - Real mode ({ accessToken }): the widget verified the OTP client-side; the
 *     server confirms the token with MSG91 and derives the phone FROM that
 *     validated token, so the client can never claim a number it didn't verify.
 */

async function bootstrapSession(fullPhone: string) {
  const service = createServiceRoleSupabaseClient();

  // NOTE: the parameter is `p_phone`, matching migration 0001. (Dhruva's
  // equivalent function takes `phone_input` — copying that call verbatim here
  // fails at runtime with an unhelpful PostgREST error.)
  const { data: existingId, error: lookupError } = await service.rpc("get_user_id_by_phone", {
    p_phone: fullPhone,
  });
  if (lookupError) {
    console.error("[otp/verify] phone lookup failed:", lookupError.message);
    return NextResponse.json({ ok: false, error: "Could not sign you in" }, { status: 500 });
  }

  let userId: string | null = existingId ?? null;

  if (!userId) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      phone: fullPhone,
      phone_confirm: true,
    });
    if (createError || !created.user) {
      console.error("[otp/verify] createUser failed:", createError?.message);
      return NextResponse.json(
        { ok: false, error: "Could not create your account" },
        { status: 500 },
      );
    }
    userId = created.user.id;
  }

  const oneTimePassword = randomBytes(32).toString("base64url");
  const { error: setPwError } = await service.auth.admin.updateUserById(userId, {
    password: oneTimePassword,
  });
  if (setPwError) {
    console.error("[otp/verify] password set failed:", setPwError.message);
    return NextResponse.json({ ok: false, error: "Could not sign you in" }, { status: 500 });
  }

  // Does a profile exist yet? This is the whole routing decision after sign-in.
  // ASHA has no role fork — users are adults, so there are no parent/child
  // accounts, no invite codes and no consent step (see CLAUDE.md). A new number
  // goes straight to profile setup.
  const { data: profileRow } = await service
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    phone: fullPhone,
    password: oneTimePassword,
    hasProfile: Boolean(profileRow),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (isDevMode()) {
    const { phone, code } = body;
    if (typeof phone !== "string" || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ ok: false, error: "Invalid phone number" }, { status: 400 });
    }
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit code" }, { status: 400 });
    }
    if (code !== computeDevOtp(phone)) {
      return NextResponse.json({ ok: false, error: "wrong-code" }, { status: 401 });
    }
    return bootstrapSession(`+91${phone}`);
  }

  // Real mode: the widget already verified the OTP. MSG91 vouches for the token,
  // and the phone comes from that verification alone.
  const { accessToken } = body;
  if (typeof accessToken !== "string" || accessToken.length < 10) {
    return NextResponse.json({ ok: false, error: "Missing access token" }, { status: 400 });
  }
  const verifiedPhone = await verifyWidgetAccessToken(accessToken);
  if (!verifiedPhone) {
    return NextResponse.json({ ok: false, error: "wrong-code" }, { status: 401 });
  }
  // Reserved dev-only test numbers must never be reachable via real SMS. The set
  // is currently empty (see lib/otp.ts) so this never fires yet — it is wired
  // now so reserving a number later needs no change here.
  if (isReservedTestPhone(verifiedPhone)) {
    return NextResponse.json(
      { ok: false, error: "This number can't sign in right now." },
      { status: 403 },
    );
  }
  return bootstrapSession(verifiedPhone);
}
