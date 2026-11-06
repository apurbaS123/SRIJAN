import { api } from "@/lib/server/api";
import { sentOffersFor } from "@/lib/domain/views";

/** Job offers clients sent to this creator from their profile, and what became of each. */
export async function GET() {
  return api(({ db, user }) => sentOffersFor(db, user!.creatorId!), { role: "creator" });
}
