// In-memory fixed-window rate limiting. Per server process — move to Redis if you run several.
import { NextResponse } from "next/server";
import { headers } from "next/headers";

const hits = new Map<string, { count: number; resetAt: number }>();

export async function clientIp() {
  const h = await headers();
  // Set by the hosting proxy (Vercel, nginx). Only the first entry is the client.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** True if `key` has used up `max` hits in the current window. */
export function overLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  const e = hits.get(key);
  if (!e || e.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  e.count += 1;
  return e.count > max;
}

/** Returns a 429 response when the caller's IP is over the limit for `bucket`. */
export async function limitByIp(bucket: string, max: number, windowMs: number) {
  if (!overLimit(`${bucket}:${await clientIp()}`, max, windowMs)) return null;
  return NextResponse.json({ ok: false, error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
}
