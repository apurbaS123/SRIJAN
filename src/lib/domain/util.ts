import { IST_OFFSET_MS } from "./config";
import type { DB } from "./types";

/** A rule was broken by the request (shown to the user as-is). */
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function assert(cond: unknown, message: string, status = 400): asserts cond {
  if (!cond) throw new DomainError(message, status);
}

let counter = 0;
export function newId(prefix: string) {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

export function randomOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
