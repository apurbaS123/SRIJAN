import { NextResponse } from "next/server";
import { api, readJson, setSession } from "@/lib/server/api";
import { isOpsEmail, normalizeEmail, normalizePhone } from "@/lib/server/env";
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
 * Sign in with { email, code } from /api/session/otp. The role comes from the account:
 * addresses in SRIJAN_OPS_EMAILS are the Srijan team (ops), creator accounts stay creators,
 * everyone else is a client (people booking shoots and brands). New addresses also send
 * { name, phone }; the phone is a contact number for shoot day, not used to sign in.
 */
export async function POST(req: Request) {
  const limited = await limitByIp("signin", 20, 10 * 60_000);
  if (limited) return limited;
  const body = await readJson<{ email?: string; code?: string; name?: string; phone?: string }>(req);
  let signedIn: string | null = null;
  const res = await api(({ db, now }) => {
    const email = normalizeEmail(body.email);
    assert(email, "Enter a valid email address");
    let user = db.users.find((u) => normalizeEmail(u.email) === email);
    if (!user && !body.name?.trim()) {
      // Check the code without using it up, then ask for a name and phone.
      verifyOtp(db, email, body.code, now, false);
      return { needsName: true };
    }
    if (!user) {
      // Check the details before using up the code, so a typo doesn't cost a new one.
      const name = cleanText(body.name, 80, "your name");
      const phone = normalizePhone(body.phone);
      assert(phone, "Enter a valid 10-digit Indian mobile number");
      verifyOtp(db, email, body.code, now);
      user = { id: newId("u"), role: "client", name, email, phone: `+91 ${phone}`, createdAt: now } satisfies User;
      db.users.push(user);
    } else {
      verifyOtp(db, email, body.code, now);
    }
    syncOpsRole(user, email);
    signedIn = user.id;
    return { id: user.id, role: user.role };
  });
  if (res.status === 200 && signedIn) setSession(res, signedIn);
  return res;
}

export async function DELETE() {
  return setSession(NextResponse.json({ ok: true, data: { signedOut: true } }), null);
}

/** SRIJAN_OPS_EMAILS decides who is on the Srijan team. Creator accounts keep their role. */
function syncOpsRole(user: User, email: string) {
  if (user.role === "creator") return;
  user.role = isOpsEmail(email) ? "ops" : "client";
}
