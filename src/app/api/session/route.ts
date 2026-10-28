import { api, readJson, setSession } from "@/lib/server/api";
import { creatorPublic } from "@/lib/domain/views";
import { assert } from "@/lib/domain/util";

/** Who is signed in. */
export async function GET() {
  return api(({ db, user }) => {
    if (!user) return { user: null, demoUsers: demoUsers(db) };
    const creator = user.creatorId ? db.creators.find((c) => c.id === user.creatorId) : undefined;
    return {
      user: { id: user.id, role: user.role, name: user.name, phone: user.phone, email: user.email },
      creator: creator ? { ...creatorPublic(creator), upiId: creator.upiId, kyc: creator.kyc } : null,
      demoUsers: demoUsers(db),
    };
  });
}

/** Demo sign-in: pick any seeded user. Replace with phone OTP login for production. */
export async function POST(req: Request) {
  const { userId } = await readJson<{ userId?: string }>(req);
  const res = await api(({ db }) => {
    const user = db.users.find((u) => u.id === userId);
    assert(user, "User not found", 404);
    return { id: user.id, role: user.role };
  });
  if (res.status === 200 && userId) setSession(res, userId);
  return res;
}

export async function DELETE() {
  const res = await api(() => ({ signedOut: true }));
  return setSession(res, null);
}

function demoUsers(db: import("@/lib/domain/types").DB) {
  return db.users.map((u) => ({ id: u.id, role: u.role, name: u.name, note: u.demoNote ?? "" }));
}
