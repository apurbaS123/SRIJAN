import { api, readJson, setSession } from "@/lib/server/api";
import { normalizeEmail } from "@/lib/server/env";
import { passwordMatches } from "@/lib/server/password";
import { limitByIp } from "@/lib/server/rateLimit";
import { MIN } from "@/lib/domain/config";
import { DomainError, assert } from "@/lib/domain/util";

const MAX_WRONG_PASSWORDS = 10;
const LOCK_MS = 15 * MIN;

/** Sign in with { email, password }. SRIJAN_OPS_EMAILS still decides who has team access, on every request. */
export async function POST(req: Request) {
  const limited = await limitByIp("password", 30, 10 * MIN);
  if (limited) return limited;
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = normalizeEmail(body.email);

  let stored: string | undefined;
  let userId: string | undefined;
  const first = await api(({ db, now }) => {
    assert(email, "Enter a valid email address");
    const user = db.users.find((u) => normalizeEmail(u.email) === email);
    assert(!(user?.passwordLockedUntil && user.passwordLockedUntil > now), "Too many wrong passwords. Try again in 15 minutes, or sign in with an email code.", 429);
    userId = user?.id;
    stored = user?.passwordHash;
    return null;
  });
  if (!first.ok) return first;

  // Hashing is slow, so it happens here, with the database unlocked.
  const matches = await passwordMatches(body.password, stored);

  let signedIn: string | null = null;
  const res = await api(({ db, now }) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user || !matches) {
      if (user) {
        user.passwordFails = (user.passwordFails ?? 0) + 1;
        if (user.passwordFails >= MAX_WRONG_PASSWORDS) {
          user.passwordFails = 0;
          user.passwordLockedUntil = now + LOCK_MS;
        }
      }
      throw new DomainError("Wrong email or password", 400, true);
    }
    user.passwordFails = undefined;
    user.passwordLockedUntil = undefined;
    signedIn = user.id;
    return { id: user.id, role: user.role };
  });
  if (res.status === 200 && signedIn) setSession(res, signedIn);
  return res;
}
