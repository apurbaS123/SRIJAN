import { api, readJson } from "@/lib/server/api";
import { acceptOffer, declineOffer } from "@/lib/domain/dispatch";
import { DomainError } from "@/lib/domain/util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readJson<{ action?: "accept" | "decline" }>(req);
  return api(
    ({ db, now, user }) => {
      if (action === "accept") {
        const b = acceptOffer(db, id, user!.creatorId!, now);
        return { accepted: true, bookingId: b.id };
      }
      if (action === "decline") {
        declineOffer(db, id, user!.creatorId!, now);
        return { accepted: false };
      }
      throw new DomainError("Unknown action");
    },
    { role: "creator" },
  );
}
