import { NextResponse } from "next/server";
import { api, readJson, setSession } from "@/lib/server/api";
import { isOpsEmail, normalizeEmail, normalizePhone } from "@/lib/server/env";
import { verifyOtp } from "@/lib/server/auth";
import { creatorVerificationMode } from "@/lib/server/digilocker";
import { hashNewPassword, passwordProblem } from "@/lib/server/password";
import { limitByIp } from "@/lib/server/rateLimit";
import { creatorPublic } from "@/lib/domain/views";
import { payoutSummary } from "@/lib/domain/creators";
import { kycSummary } from "@/lib/domain/kyc";
import { assert, cleanText, newId } from "@/lib/domain/util";
import type { User } from "@/lib/domain/types";

/** Who is signed in. */
export async function GET() {
  return api(({ db, user }) => {
    /** How creators get verified right now. Also sent to visitors, for the wording on /join. */
    const creatorVerification = creatorVerificationMode();
    if (!user) return { user: null, creatorVerification };
    const creator = user.creatorId ? db.creators.find((c) => c.id === user.creatorId) : undefined;
    return {
      user: { id: user.id, role: user.role, name: user.name, phone: user.phone, email: user.email },
      creator: creator ? { ...creatorPublic(creator), payout: payoutSummary(creator), kyc: kycSummary(creator) } : null,
      creatorVerification,
    };
  });
}

/**
 * Sign in with { email, code } from /api/session/otp. The role comes from the account:
 * addresses in SRIJAN_OPS_EMAILS are the Srijan team (ops), creator accounts stay creators,
 * everyone else is a client (people booking shoots and brands). New addresses also send
 * { name, phone }; the phone is a contact number for shoot day, not used to sign in.
 * They also send { password }: to set their first one, or to replace a forgotten one. The code proves they own the email, which is why a signed-in session alone can't change it.
 */
export async function POST(req: Request) {
  const limited = await limitByIp("signin", 20, 10 * 60_000);
  if (limited) return limited;
  const body = await readJson<{ email?: string; code?: string; name?: string; phone?: string; password?: string }>(req);
  // Hashing is slow, so it happens here, before the database is locked.
  const passwordHash = await hashNewPassword(body.password);
  let signedIn: string | null = null;
  const res = await api(({ db, now }) => {
    const email = normalizeEmail(body.email);
    assert(email, "Enter a valid email address");
    if (body.password) assert(passwordHash, passwordProblem(body.password)!);
    let user = db.users.find((u) => normalizeEmail(u.email) === email);
    if (!user && !body.name?.trim()) {
      // Check the code without using it up, then ask for a name and phone. Once the code is
      // proven, say which kind of account this will be so the page can word it right.
      verifyOtp(db, email, body.code, now, false);
      return { needsName: true, newRole: isOpsEmail(email) ? "ops" : "client" };
    }
    if (!user) {
      // Check the details before using up the code, so a typo doesn't cost a new one.
      const name = cleanText(body.name, 80, "your name");
      const phone = normalizePhone(body.phone);
      assert(phone, "Enter a valid 10-digit Indian mobile number");
      assert(passwordHash, passwordProblem(body.password)!);
      verifyOtp(db, email, body.code, now);
      user = { id: newId("u"), role: "client", name, email, phone: `+91 ${phone}`, createdAt: now, passwordHash } satisfies User;
      db.users.push(user);
    } else {
      // An account from before passwords, or from a brand's call request: it adds one now.
      if (!user.passwordHash && !passwordHash) {
        verifyOtp(db, email, body.code, now, false);
        return { needsPassword: true };
      }
      verifyOtp(db, email, body.code, now);
      if (passwordHash) {
        user.passwordHash = passwordHash;
        user.passwordFails = undefined;
        user.passwordLockedUntil = undefined;
      }
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
