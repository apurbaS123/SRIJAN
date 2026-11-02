import { api, readJson } from "@/lib/server/api";
import { markNotificationRead, unreadNotifications } from "@/lib/domain/notifications";

/** Unread messages for whoever is signed in (empty when signed out). */
export async function GET() {
  return api(({ db, user }) => (user ? unreadNotifications(db, user.id) : []));
}

/** { id } dismisses one message. */
export async function POST(req: Request) {
  const { id } = await readJson<{ id?: string }>(req);
  return api(
    ({ db, now, user }) => {
      markNotificationRead(db, user!.id, String(id), now);
      return { ok: true };
    },
    { role: ["client", "creator", "ops"] },
  );
}
