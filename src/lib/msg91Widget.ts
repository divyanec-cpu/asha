"use client";

/**
 * Client-side loader for the MSG91 OTP Widget (real mode only).
 *
 * The widget is initialized HEADLESS (exposeMethods: true): it never renders its
 * own UI, so our pixel-matched phone and OTP screens stay exactly as designed
 * and we drive the widget through the methods it puts on `window`.
 *
 * hCaptcha runs inside the widget, which is why this path only works on a
 * deployed HTTPS domain and never on localhost. Dev mode covers local work.
 */

const SCRIPT_SRC = "https://verify.msg91.com/otp-provider.js";

type WidgetCallback = (data: unknown) => void;

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, onSuccess: WidgetCallback, onFailure: WidgetCallback) => void;
    retryOtp?: (
      channel: string | null,
      onSuccess: WidgetCallback,
      onFailure: WidgetCallback,
    ) => void;
    verifyOtp?: (otp: string, onSuccess: WidgetCallback, onFailure: WidgetCallback) => void;
  }
}

/** MSG91's channel id for SMS retries. */
export const RETRY_CHANNEL_SMS = "11";

let loadPromise: Promise<void> | null = null;

/**
 * The widget initializes asynchronously AFTER its script's onload fires. Calling
 * window.sendOtp in that gap silently does nothing — found live on Dhruva, where
 * the first production send hung on "Sending…" forever. So resolve only once the
 * exposed methods actually exist.
 */
function waitForExposedMethods(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (typeof window.sendOtp === "function" && typeof window.verifyOtp === "function") {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("OTP service did not initialize"));
      }
    }, 100);
  });
}

/**
 * Load the widget script and initialize it headless. Idempotent; the promise
 * resolves only when the exposed methods are callable.
 */
export function loadMsg91Widget(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      window.initSendOTP?.({
        widgetId: process.env.NEXT_PUBLIC_MSG91_WIDGET_ID,
        tokenAuth: process.env.NEXT_PUBLIC_MSG91_TOKEN_AUTH,
        exposeMethods: true,
        success: () => {},
        failure: () => {},
      });
      waitForExposedMethods(12_000).then(resolve, (err) => {
        loadPromise = null; // allow a retry on the next attempt
        reject(err);
      });
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Could not load the OTP service"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * The widget's success callbacks receive `{ message: <jwt>, type: 'success' }`
 * on verify, or a request id on send/retry. Pull the message string out.
 */
export function widgetMessage(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}
