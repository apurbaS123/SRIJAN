import { api, readJson } from "@/lib/server/api";
import { bookingView, creatorPublic, opsOverview } from "@/lib/domain/views";
import { setVerification } from "@/lib/domain/creators";
import { runPayouts } from "@/lib/domain/wallet";
import { canTakeShoots, isCreatorBusy } from "@/lib/domain/dispatch";
import { haversineKm, DomainError } from "@/lib/domain/util";

const ACTIVE = ["searching", "needs_ops", "assigned", "shooting", "editing", "delivered", "revision_requested"];

/** Everything the ops dashboard needs in one call. */
export async function GET() {
  return api(
    ({ db, now, viewer }) => {
      const active = db.bookings
        .filter((b) => ACTIVE.includes(b.status))
        .sort((a, b) => Number(b.status === "needs_ops") - Number(a.status === "needs_ops") || a.scheduledAt - b.scheduledAt);
      return {
        ...opsOverview(db, now),
        dispatch: active.map((b) => ({
          ...bookingView(db, b, viewer),
          // Who ops could assign by hand, nearest first.
          candidates:
            b.status === "searching" || b.status === "needs_ops"
              ? db.creators
                  .filter((c) => canTakeShoots(c) && !isCreatorBusy(db, c.id, b))
                  .map((c) => ({ id: c.id, name: c.name, available: c.available, km: Math.round(haversineKm(c, b) * 10) / 10 }))
                  .sort((x, y) => x.km - y.km)
                  .slice(0, 8)
              : [],
        })),
        pendingCreators: db.creators
          .filter((c) => c.verification === "pending")
          .map((c) => {
            const u = db.users.find((x) => x.id === c.userId);
            return { ...creatorPublic(c), kyc: c.kyc, phone: u?.phone, email: u?.email };
          }),
        creators: db.creators.filter((c) => c.verification === "verified").map(creatorPublic),
      };
    },
    { role: "ops" },
  );
}

type Action =
  | { action: "verify"; creatorId: string; decision: "verified" | "rejected"; kycChecked?: boolean }
  | { action: "payout_run" };

export async function POST(req: Request) {
  const body = await readJson<Action>(req);
  return api(
    ({ db }) => {
      switch (body.action) {
        case "verify":
          return setVerification(db, body.creatorId, body.decision, body.kycChecked === true);
        case "payout_run":
          return runPayouts(db);
        default:
          throw new DomainError("Unknown action");
      }
    },
    { role: "ops" },
  );
}
