import { api, readJson } from "@/lib/server/api";
import { paymentRequestLines, sendClientAlert } from "@/lib/server/alerts";
import { acceptOffer, declineOffer } from "@/lib/domain/dispatch";
import { DomainError } from "@/lib/domain/util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readJson<{ action?: "accept" | "decline" }>(req);
  // The client may well have closed the site while waiting, so the request to pay is emailed too.
  let ask: { email?: string; lines: string[] } | undefined;
  const res = await api(
    ({ db, now, user }) => {
      if (action === "accept") {
        const b = acceptOffer(db, id, user!.creatorId!, now);
        ask = { email: db.users.find((u) => u.id === b.clientId)?.email, lines: paymentRequestLines(db, b) };
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
  if (res.ok && ask) sendClientAlert(ask.email, ask.lines);
  return res;
}
