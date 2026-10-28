import { api } from "@/lib/server/api";
import { offerView } from "@/lib/domain/views";

/** A creator's open job alerts. Poll this every few seconds (swap for push notifications later). */
export async function GET() {
  return api(
    ({ db, user }) =>
      db.offers
        .filter((o) => o.creatorId === user!.creatorId && o.status === "pending")
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .map((o) => offerView(db, o)),
    { role: "creator" },
  );
}
