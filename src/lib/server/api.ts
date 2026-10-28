import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DB, Role, User } from "@/lib/domain/types";
import { DomainError } from "@/lib/domain/util";
import type { Viewer } from "@/lib/domain/views";
import { withDb } from "./store";

export const SESSION_COOKIE = "srijan_uid";

export interface Ctx {
  db: DB;
  now: number;
  user?: User;
  viewer: Viewer;
}

/**
 * Wraps a route: loads data, checks the signed-in role, runs `fn`, saves, and replies
 * `{ ok, data, serverNow }` or `{ ok: false, error }`.
 */
export async function api<T>(fn: (ctx: Ctx) => T, opts: { role?: Role | Role[] } = {}) {
  const uid = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const { result, now } = await withDb((db, now) => {
      const user = uid ? db.users.find((u) => u.id === uid) : undefined;
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

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function setSession(res: NextResponse, userId: string | null) {
  if (userId) {
    res.cookies.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  } else {
    res.cookies.delete(SESSION_COOKIE);
  }
  return res;
}
