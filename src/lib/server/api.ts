import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DB, Role, User } from "@/lib/domain/types";
import { DomainError } from "@/lib/domain/util";
import type { Viewer } from "@/lib/domain/views";
import { IS_PROD, isOpsPhone, normalizePhone, sessionSecret } from "./env";
import { withDb } from "./store";

export const SESSION_COOKIE = "srijan_session";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;
const MAX_BODY_CHARS = 64 * 1024;

export interface Ctx {
  db: DB;
  now: number;
  user?: User;
  viewer: Viewer;
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Cookie value: "<userId>.<expiresAtSec>.<hmac>" so it can't be forged or edited. */
function sessionToken(userId: string) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S}`;
  return `${payload}.${sign(payload)}`;
}

function sessionUserId(token: string | undefined) {
  if (!token) return undefined;
  const i = token.lastIndexOf(".");
  if (i < 0) return undefined;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  const [userId, exp] = payload.split(".");
  if (!userId || !(Number(exp) * 1000 > Date.now())) return undefined;
  return userId;
}

/**
 * Wraps a route: loads data, checks the signed-in role, runs `fn`, saves, and replies
 * `{ ok, data, serverNow }` or `{ ok: false, error }`.
 */
export async function api<T>(fn: (ctx: Ctx) => T, opts: { role?: Role | Role[] } = {}) {
  try {
    const uid = sessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
    const { result, now } = await withDb((db, now) => {
      const user = uid ? db.users.find((u) => u.id === uid) : undefined;
      // Removed from SRIJAN_OPS_PHONES: lose team access straight away, not at the next sign-in.
      if (user?.role === "ops" && !isOpsPhone(normalizePhone(user.phone))) user.role = "client";
      if (opts.role) {
        const roles = Array.isArray(opts.role) ? opts.role : [opts.role];
        if (!user) throw new DomainError("Please sign in first", 401);
        if (!roles.includes(user.role)) throw new DomainError("Your account can’t do that", 403);
      }
      return fn({ db, now, user, viewer: { userId: user?.id, role: user?.role, creatorId: user?.creatorId } });
    });
    return NextResponse.json({ ok: true, data: result, serverNow: now });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/** Parses a JSON object body; anything too large, malformed or not an object becomes `{}`. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return {} as T;
    const v: unknown = JSON.parse(text);
    return (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as T;
  } catch {
    return {} as T;
  }
}

export function setSession(res: NextResponse, userId: string | null) {
  if (userId) {
    res.cookies.set(SESSION_COOKIE, sessionToken(userId), {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
  } else {
    res.cookies.delete(SESSION_COOKIE);
  }
  return res;
}
