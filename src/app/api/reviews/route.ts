import { api } from "@/lib/server/api";
import { pendingReviews } from "@/lib/domain/views";

/**
 * Jobs the signed-in client has approved but not yet reviewed. The review pop-up can't be dismissed,
 * so this is what decides whether it is in the way.
 */
export async function GET() {
  return api(({ db, viewer }) => pendingReviews(db, viewer));
}
