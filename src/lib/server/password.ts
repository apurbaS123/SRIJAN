// Account passwords. Only a salted scrypt hash is stored. Hashing is deliberately slow, so do it
// before or after withDb, never while the database is locked.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, bytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, bytes, { N: n, r, p, maxmem: 256 * n * r }, (e, key) => (e ? reject(e) : resolve(key)));
  });
}

/** What's wrong with a new password, or null if it's fine. */
export function passwordProblem(raw: unknown) {
  if (typeof raw !== "string" || raw.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters`;
  if (raw.length > MAX_PASSWORD) return `Passwords can be up to ${MAX_PASSWORD} characters`;
  return null;
}

/** The hash of a valid new password, or undefined if there is none to save. */
export async function hashNewPassword(raw: unknown) {
  if (passwordProblem(raw)) return undefined;
  const salt = randomBytes(16);
  const key = await derive(raw as string, salt, N, R, P, KEY_BYTES);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

let decoy: Promise<string | undefined> | undefined;

/** With no stored hash it checks a decoy, so an unknown email takes as long as a wrong password. */
export async function passwordMatches(raw: unknown, stored: string | undefined) {
  const given = typeof raw === "string" && raw.length <= MAX_PASSWORD ? raw : "";
  const hash = stored ?? (await (decoy ??= hashNewPassword("decoy-password")))!;
  const [, n, r, p, salt, key] = hash.split("$");
  const expected = Buffer.from(key!, "base64");
  const actual = await derive(given, Buffer.from(salt!, "base64"), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(actual, expected) && !!stored && !!given;
}
