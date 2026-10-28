import { api } from "@/lib/server/api";
import { creatorPublic } from "@/lib/domain/views";
import { assert } from "@/lib/domain/util";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(({ db }) => {
    const c = db.creators.find((x) => x.id === id);
    assert(c && (c.verification === "verified"), "Creator not found", 404);
    const reviews = db.bookings
      .filter((b) => b.creatorId === id && b.rating)
      .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
      .slice(0, 5)
      .map((b) => ({ rating: b.rating!, review: b.review, at: b.approvedAt ?? b.createdAt }));
    return { ...creatorPublic(c), reviews };
  });
}
