import { NextResponse } from "next/server";
import { api, readJson, setSession } from "@/lib/server/api";
import { isOpsPhone, normalizePhone } from "@/lib/server/env";
import { verifyOtp } from "@/lib/server/auth";
import { limitByIp } from "@/lib/server/rateLimit";
import { creatorPublic } from "@/lib/domain/views";
import { assert, cleanText, newId } from "@/lib/domain/util";
import type { User } from "@/lib/domain/types";

/** Who is signed in. */
export async function GET() {
  return api(({ db, user }) => {
    if (!user) return { user: null };
    const creator = user.creatorId ? db.creators.find((c) => c.id === user.creatorId) : undefined;
    return {
      user: { id: user.id, role: user.role, name: user.name, phone: user.phone, email: user.email },
      creator: creator ? { ...creatorPublic(creator), upiId: creator.upiId, kyc: creator.kyc } : null,
    };
  });
}

/**
 * Sign in with { phone, code } from /api/session/otp. The role comes from the account:
 * numbers in SRIJAN_OPS_PHONES are the Srijan team (ops), creator accounts stay creators,
 * everyone else is a client (people booking shoots and brands). New numbers also send { name }.
 */
export async function POST(req: Request) {
  const limited = await limitByIp("signin", 20, 10 * 60_000);
  if (limited) return limited;
  const body = await readJson<{ phone?: string; code?: string; name?: string }>(req);
  let signedIn: string | null = null;
  const res = await api(({ db, now }) => {
    const phone = normalizePhone(body.phone);
    assert(phone, "Enter a valid 10-digit Indian mobile number");
    let user = db.users.find((u) => normalizePhone(u.phone) === phone);
    if (!user && !body.name?.trim()) {
      // Check the code without using it up, then ask for a name.
      verifyOtp(db, phone, body.code, now, false);
      return { needsName: true };
    }
    verifyOtp(db, phone, body.code, now);
    if (!user) {
      const name = cleanText(body.name, 80, "your name");
      user = { id: newId("u"), role: "client", name, phone: `+91 ${phone}`, createdAt: now } satisfies User;
      db.users.push(user);
    }
    syncOpsRole(user, phone);
    signedIn = user.id;
    return { id: user.id, role: user.role };
  });
  if (res.status === 200 && signedIn) setSession(res, signedIn);
  return res;
}

export async function DELETE() {
  return setSession(NextResponse.json({ ok: true, data: { signedOut: true } }), null);
}

/** SRIJAN_OPS_PHONES decides who is on the Srijan team. Creator accounts keep their role. */
function syncOpsRole(user: User, phone: string) {
  if (user.role === "creator") return;
  user.role = isOpsPhone(phone) ? "ops" : "client";
}
