"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { devModeAllowed } from "@/lib/devMode";
import { RETRY_CHANNEL_SMS, loadMsg91Widget, widgetMessage } from "@/lib/msg91Widget";

/**
 * Design screens 2a: splash + phone entry, then OTP entry.
 *
 * DELIBERATE DEVIATION FROM THE MOCKUP. The design draws a custom on-screen
 * numeric keypad under the OTP boxes, because it was mocked as a native app.
 * This is a web app, and a custom keypad would actively hurt: it blocks the
 * native keyboard and, more importantly, blocks SMS autofill — iOS and Android
 * both offer to fill a one-time code straight from the notification when an
 * input carries autocomplete="one-time-code". That is the single biggest UX win
 * available in this flow, so the six boxes are rendered as designed with a
 * transparent real input over them. The look is preserved; the behaviour is
 * better than the mockup could express.
 */

/**
 * Must use the same gate as the server (lib/devMode.ts), not just the
 * NEXT_PUBLIC flag. If the client took the dev path while the server refused it,
 * login would fail with "Missing access token" — a confusing error for what is
 * actually a misconfiguration. A production build takes the real MSG91 path
 * whatever the flags say.
 */
const DEV_MODE = devModeAllowed();
const RESEND_SECONDS = 24;

export default function AuthFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const phoneValid = /^\d{10}$/.test(phone);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  // Focus the code field on arrival so the keyboard (and any autofill prompt)
  // appears without an extra tap.
  useEffect(() => {
    if (step === "otp") codeInputRef.current?.focus();
  }, [step]);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      if (DEV_MODE) {
        const res = await fetch("/api/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Could not send the code");
      } else {
        await loadMsg91Widget();
        await new Promise<void>((resolve, reject) => {
          window.sendOtp?.(
            `91${phone}`,
            () => resolve(),
            (e) => reject(new Error(widgetMessage(e) ?? "Could not send the code")),
          );
        });
      }
      setStep("otp");
      setCode("");
      setSecondsLeft(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (secondsLeft > 0) return;
    setError(null);
    setBusy(true);
    try {
      if (DEV_MODE) {
        await fetch("/api/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          window.retryOtp?.(
            RETRY_CHANNEL_SMS,
            () => resolve(),
            (e) => reject(new Error(widgetMessage(e) ?? "Could not resend")),
          );
        });
      }
      setSecondsLeft(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend");
    } finally {
      setBusy(false);
    }
  }

  async function verify(fullCode: string) {
    setError(null);
    setBusy(true);
    try {
      let payload: Record<string, string>;
      if (DEV_MODE) {
        payload = { phone, code: fullCode };
      } else {
        const accessToken = await new Promise<string>((resolve, reject) => {
          window.verifyOtp?.(
            fullCode,
            (data) => {
              const msg = widgetMessage(data);
              if (msg) resolve(msg);
              else reject(new Error("Verification failed"));
            },
            (e) => reject(new Error(widgetMessage(e) ?? "wrong-code")),
          );
        });
        payload = { accessToken };
      }

      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(
          data.error === "wrong-code" ? "That code doesn't match. Try again." : data.error,
        );
      }

      // The browser signs itself in — see the long comment in api/otp/verify.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: data.phone,
        password: data.password,
      });
      if (signInError) throw new Error(signInError.message);

      router.replace(data.hasProfile ? "/" : "/profile");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code");
      setCode("");
      setBusy(false);
    }
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setError(null);
    if (digits.length === 6) void verify(digits);
  }

  // ── Phone step ──────────────────────────────────────────────────────────
  if (step === "phone") {
    return (
      <main className="flex min-h-dvh flex-col bg-ink px-7">
        <div className="flex flex-1 flex-col justify-center gap-7">
          <div>
            <div className="font-mono text-2xl font-semibold tracking-[0.35em] text-paper">
              ASHA
            </div>
            <div className="mt-3.5 h-0.5 w-11 bg-brass" />
          </div>

          <h1 className="text-[21px] leading-snug text-paper text-pretty">
            You&rsquo;ve taken the mock.
            <br />
            Now find out where you stand.
          </h1>

          <p className="text-[13.5px] leading-relaxed text-mute-500 text-pretty">
            ASHA reads your own attempt data across every mock you log and tells you what to
            change next &mdash; with the sample size behind every claim. It doesn&rsquo;t teach,
            doesn&rsquo;t sell mocks, and doesn&rsquo;t rank you against anyone.
          </p>
        </div>

        <div className="flex flex-col gap-3 pb-7">
          <label className="flex items-center gap-2.5 rounded-[13px] border border-paper/[0.16] bg-paper/[0.08] px-4 py-[15px]">
            <span className="font-mono text-base font-medium text-mute-500">+91</span>
            <span className="h-5 w-px bg-paper/[0.18]" />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98••• •••••"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                setError(null);
              }}
              className="tnum min-w-0 flex-1 bg-transparent font-mono text-base font-medium tracking-wide text-paper placeholder:text-mute-500/70 focus:outline-none"
            />
          </label>

          {error && <p className="text-[12.5px] text-bad-soft">{error}</p>}

          <button
            type="button"
            disabled={!phoneValid || busy}
            onClick={() => void sendCode()}
            className="rounded-[13px] bg-brass py-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send OTP"}
          </button>

          {/* "our terms" now points at terms that exist. Asking someone to agree
              to an unreachable document is the kind of small dishonesty that
              costs nothing to fix and everything to be caught doing. */}
          <p className="text-center text-[11.5px] leading-relaxed text-[#6B6659]">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline decoration-[#6B6659]/50">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline decoration-[#6B6659]/50">
              privacy policy
            </Link>
            . Adults only &mdash; ASHA is not for under-18s. You can export or delete everything,
            any time.
          </p>
        </div>
      </main>
    );
  }

  // ── OTP step ────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-dvh flex-col bg-paper px-7 pt-2">
      <button
        type="button"
        onClick={() => {
          setStep("phone");
          setError(null);
        }}
        className="w-8 py-2 text-left font-mono text-sm text-[#6B6659]"
        aria-label="Back"
      >
        &larr;
      </button>

      <h1 className="mt-8 text-[26px] font-semibold leading-tight text-ink">Enter the code</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B6659]">
        Sent to +91 {phone}.{" "}
        <button
          type="button"
          onClick={() => setStep("phone")}
          className="font-semibold text-brass"
        >
          Change number
        </button>
      </p>

      {/* Six boxes as designed, with one real input laid transparently over them
          so the native keyboard and SMS autofill both work. */}
      <div className="relative mt-8">
        <div className="flex gap-2.5" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex aspect-square flex-1 items-center justify-center rounded-xl bg-white font-mono text-2xl font-semibold text-ink ${
                i === code.length
                  ? "border-2 border-brass"
                  : "border border-ink/[0.14]"
              }`}
            >
              {code[i] ?? ""}
            </div>
          ))}
        </div>
        <input
          ref={codeInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={busy}
          onChange={(e) => onCodeChange(e.target.value)}
          aria-label="Six-digit code"
          className="absolute inset-0 h-full w-full cursor-default bg-transparent text-transparent caret-transparent focus:outline-none"
        />
      </div>

      {error ? (
        <p className="mt-4 text-[12.5px] text-bad">{error}</p>
      ) : (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={secondsLeft > 0 || busy}
          className="mt-[18px] text-left font-mono text-[12.5px] font-medium text-mute-500 disabled:text-mute-400"
        >
          {secondsLeft > 0
            ? `RESEND IN 0:${String(secondsLeft).padStart(2, "0")}`
            : "RESEND CODE"}
        </button>
      )}

      {busy && (
        <p className="mt-4 font-mono text-[12.5px] text-mute-500">CHECKING…</p>
      )}

      {DEV_MODE && (
        <p className="mt-auto mb-6 rounded-xl border border-dashed border-ink/20 px-4 py-3 text-[12px] leading-relaxed text-mute-400">
          Dev mode: no SMS is sent. Your six-digit code is printed in the terminal running{" "}
          <span className="font-mono">npm run dev</span>.
        </p>
      )}
    </main>
  );
}
