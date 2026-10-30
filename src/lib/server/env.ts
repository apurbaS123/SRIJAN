// Server-only settings read from the environment (see README → Production setup).

export const IS_PROD = process.env.NODE_ENV === "production";

const DEV_SECRET = "dev-only-insecure-session-secret-do-not-use-in-production";

export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (IS_PROD) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  return DEV_SECRET;
}

/** Last 10 digits of an Indian mobile number, or "" if it isn't one. */
export function normalizePhone(raw: unknown) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : "";
}

/** Lower-cased email address, or "" if it doesn't look like one. */
export function normalizeEmail(raw: unknown) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}

/** Srijan team (ops) email addresses. Only these get ops access, checked on every request. */
export function isOpsEmail(email: string) {
  return !!email && (process.env.SRIJAN_OPS_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(email);
}
