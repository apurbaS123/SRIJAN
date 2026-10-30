import type { NextRequest } from "next/server";
import { api, readJson, setSession } from "@/lib/server/api";
import { creatorPublic } from "@/lib/domain/views";
import { signUpCreator, type SignupInput } from "@/lib/domain/creators";
import { assert } from "@/lib/domain/util";
import { normalizeEmail, normalizePhone } from "@/lib/server/env";
import { verifyOtp } from "@/lib/server/auth";
import { limitByIp } from "@/lib/server/rateLimit";
import type { ServiceKey } from "@/lib/domain/types";

/** Public directory: ?service=videography&city=guwahati&available=1 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const service = q.get("service") as ServiceKey | null;
  const city = q.get("city");
  const availableOnly = q.get("available") === "1";
  const text = (q.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  return api(({ db }) =>
    db.creators
      .filter((c) => c.verification === "verified")
      .filter((c) => !service || c.services.some((s) => s.key === service))
      .filter((c) => !city || c.cityId === city)
      .filter((c) => !availableOnly || c.available)
      .filter((c) => !text || `${c.name} ${c.bio} ${c.services.map((s) => s.title).join(" ")}`.toLowerCase().includes(text))
      .map(creatorPublic)
      .sort((a, b) => Number(b.available) - Number(a.available) || (b.rating ?? 0) - (a.rating ?? 0)),
  );
}

/** Creator sign-up with a verified email ({ code } from /api/session/otp). Signs the new creator in. */
export async function POST(req: Request) {
  const limited = await limitByIp("signup", 10, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<SignupInput & { code?: string }>(req);
  let newUserId: string | null = null;
  const res = await api(({ db, now }) => {
    const email = normalizeEmail(input.email);
    assert(email, "Enter a valid email address");
    const phone = normalizePhone(input.phone);
    assert(phone, "Enter a valid 10-digit Indian mobile number");
    // Check the code first without using it up, then again once the profile is valid.
    verifyOtp(db, email, input.code, now, false);
    const { user, creator } = signUpCreator(db, input, { email, phone }, now);
    verifyOtp(db, email, input.code, now);
    newUserId = user.id;
    return { userId: user.id, creatorId: creator.id };
  });
  if (res.status === 200 && newUserId) setSession(res, newUserId);
  return res;
}
