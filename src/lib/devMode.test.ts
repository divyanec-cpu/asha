/**
 * Tests for the dev-mode gate.
 *
 * This exists because the failure mode is catastrophic and silent: dev mode on a
 * public URL means anyone can compute the deterministic OTP for any phone number
 * (the salt is in this repo) and sign in as that person. The guard is one `if`,
 * which is exactly the kind of thing that gets "simplified" by someone who reads
 * it as a redundant NODE_ENV check.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { devModeAllowed } from "./devMode.ts";

const SAVED = {
  NODE_ENV: process.env.NODE_ENV,
  MSG91_DEV_MODE: process.env.MSG91_DEV_MODE,
  NEXT_PUBLIC_MSG91_DEV_MODE: process.env.NEXT_PUBLIC_MSG91_DEV_MODE,
};

/** NODE_ENV is readonly in the Next types but writable at runtime. */
function setEnv(key: keyof typeof SAVED, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else (process.env as Record<string, string>)[key] = value;
}

describe("dev-mode gate", () => {
  beforeEach(() => {
    for (const k of Object.keys(SAVED) as (keyof typeof SAVED)[]) setEnv(k, undefined);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED)) setEnv(k as keyof typeof SAVED, v);
  });

  test("off when nothing is set — the safe default", () => {
    assert.equal(devModeAllowed(), false);
  });

  test("on in development when the server flag is set", () => {
    setEnv("NODE_ENV", "development");
    setEnv("MSG91_DEV_MODE", "true");
    assert.equal(devModeAllowed(), true);
  });

  test("on in development from the client flag alone, so both sides agree", () => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXT_PUBLIC_MSG91_DEV_MODE", "true");
    assert.equal(devModeAllowed(), true);
  });

  test("REFUSED in production even with both flags set to true", () => {
    // The whole point. Pasting .env.local.example into a hosting provider's
    // environment settings sets exactly this, and it must not open the door.
    setEnv("NODE_ENV", "production");
    setEnv("MSG91_DEV_MODE", "true");
    setEnv("NEXT_PUBLIC_MSG91_DEV_MODE", "true");
    assert.equal(devModeAllowed(), false);
  });

  test("only the exact string 'true' counts", () => {
    setEnv("NODE_ENV", "development");
    for (const v of ["1", "yes", "TRUE", "on", ""]) {
      setEnv("MSG91_DEV_MODE", v);
      assert.equal(devModeAllowed(), false, `"${v}" must not enable dev mode`);
    }
  });
});
