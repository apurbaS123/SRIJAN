import { IST_OFFSET_MS } from "./config";
import type { DB } from "./types";

/** A rule was broken by the request (shown to the user as-is). */
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
    /** Save the changes made so far (e.g. a failed-attempt counter) instead of discarding them. */
    public keepChanges = false,
  ) {
    super(message);
  }
}

export function assert(cond: unknown, message: string, status = 400): asserts cond {
  if (!cond) throw new DomainError(message, status);
}

/** Unguessable id, e.g. bkg_3f9c1a7e2b4d4e0f9a1c. */
export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Uniform random integer in [0, max) from a secure source. */
function randomInt(max: number) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

/** Human-readable sequential code, e.g. SR-2051 or CMP-104. */
export function nextCode(db: DB, prefix: string) {
  db.seq += 1;
  return `${prefix}-${db.seq}`;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const rupees = (n: number) => Math.round(n);

/** "2026-10-27T15:00" typed in India → epoch ms. */
export function parseIstLocal(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return NaN;
  const [, y, mo, d, h, mi] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
}

/** Hour of day in IST (0–23). */
export function istHour(ms: number) {
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

/** "YYYY-MM-DD" of the IST calendar day. */
export function istDay(ms: number) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMonth(ms: number) {
  return istDay(ms).slice(0, 7);
}

export function randomOtp(digits = 4) {
  const min = 10 ** (digits - 1);
  return String(min + randomInt(9 * min));
}

/** Trimmed text, required unless `optional`, at most `max` characters. */
export function cleanText(value: unknown, max: number, label: string, optional = false): string {
  const v = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!optional) assert(v.length > 0, `Enter ${label}`);
  assert(v.length <= max, `Keep ${label} under ${max} characters`);
  return v;
}

/** An http(s) link of reasonable length, or undefined when empty and optional. */
export function cleanUrl(value: unknown, label: string, optional = false): string | undefined {
  const v = cleanText(value, 500, label, optional);
  if (!v) return undefined;
  let ok = false;
  try {
    const u = new URL(v);
    ok = u.protocol === "https:" || u.protocol === "http:";
  } catch {}
  assert(ok, `Paste a full link for ${label}, starting with https://`);
  return v;
}
