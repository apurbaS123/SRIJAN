// Email sign-in codes: issue, rate-limit and check. Codes are stored only as HMACs.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "@/lib/domain/types";
import { DomainError, assert, randomOtp } from "@/lib/domain/util";
import { sessionSecret } from "./env";

const CODE_TTL_MS = 10 * 60_000;
const RESEND_GAP_MS = 60_000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60_000;

function hashCode(email: string, code: string) {
  return createHmac("sha256", sessionSecret()).update(`otp:${email}:${code}`).digest("hex");
}

/** Creates a new 6-digit code for `email` and returns it (the caller sends it). */
export function issueOtp(db: DB, email: string, now: number) {
  // Also drops codes from before sign-in moved to email (they have no `email`).
  db.otps = (db.otps ?? []).filter((o) => o.sentAt > now - HOUR && o.email);
  const recent = db.otps.filter((o) => o.email === email);
  assert(recent.length < MAX_CODES_PER_HOUR, "Too many codes requested for this email. Try again in an hour.", 429);
  const last = Math.max(0, ...recent.map((o) => o.sentAt));
  assert(now - last >= RESEND_GAP_MS, "Please wait a minute before asking for another code", 429);
  const code = randomOtp(6);
  db.otps.push({ email, codeHash: hashCode(email, code), sentAt: now, expiresAt: now + CODE_TTL_MS, attempts: 0 });
  return code;
}

/**
 * Checks the latest code for `email`. Wrong guesses are counted (and saved) so a code
 * can't be brute-forced. With `consume`, a correct code can't be used again.
 */
export function verifyOtp(db: DB, email: string, code: unknown, now: number, consume = true) {
  const list = db.otps ?? [];
  const o = list.filter((x) => x.email === email).sort((a, b) => b.sentAt - a.sentAt)[0];
  assert(o && o.expiresAt > now, "That code has expired. Ask for a new one.");
  assert(o.attempts < MAX_ATTEMPTS, "Too many wrong codes. Ask for a new one.", 429);
  const given = Buffer.from(hashCode(email, String(code ?? "").replace(/\D/g, "")));
  const expected = Buffer.from(o.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    o.attempts += 1;
    throw new DomainError("That code is wrong. Check the latest code we sent.", 400, true);
  }
  if (consume) db.otps = list.filter((x) => x.email !== email);
}
