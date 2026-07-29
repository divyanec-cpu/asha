import { NextRequest, NextResponse } from "next/server";
import { computeDevOtp, isDevMode } from "@/lib/otp";

export async function POST(req: NextRequest) {
  const { phone } = await req.json();

  if (typeof phone !== "string" || !/^\d{10}$/.test(phone)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid 10-digit mobile number" },
      { status: 400 },
    );
  }

  if (isDevMode()) {
    console.log(`[dev-otp] Code for +91${phone}: ${computeDevOtp(phone)}`);
    return NextResponse.json({ ok: true });
  }

  // Real mode: the MSG91 widget sends the OTP client-side, so the browser never
  // calls this route. Reaching here in real mode means the dev-mode flags are
  // inconsistent — MSG91_DEV_MODE and NEXT_PUBLIC_MSG91_DEV_MODE must match.
  return NextResponse.json(
    { ok: false, error: "OTP sending is handled by the MSG91 widget in production" },
    { status: 500 },
  );
}
