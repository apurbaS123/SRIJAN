// Public marketplace data, read on the server so a page can ship it in its HTML.
//
// The same data /api/creators returns to a browser. It exists separately because a server
// component cannot sensibly call its own HTTP route — it already has the database — and because
// what a crawler, a scripting-off browser or a slow phone gets on the first paint should not
// depend on a round trip.
import { creatorPublic, type CreatorPublic } from "@/lib/domain/views";
import { withDb } from "./store";

/**
 * Every verified creator, online ones first and then by rating — the same order /api/creators
 * sorts by, so the server's first paint and the browser's refresh agree.
 *
 * Returns an empty list rather than throwing if the database is unreachable: a page with a real
 * heading and no creators is worth more than an error page.
 */
export async function publicCreators(): Promise<CreatorPublic[]> {
  try {
    const { result } = await withDb((db) =>
      db.creators
        .filter((c) => c.verification === "verified")
        .map(creatorPublic)
        .sort((a, b) => Number(b.available) - Number(a.available) || (b.rating ?? 0) - (a.rating ?? 0)),
    );
    return result;
  } catch (e) {
    console.error("Could not list creators for the page", e);
    return [];
  }
}
