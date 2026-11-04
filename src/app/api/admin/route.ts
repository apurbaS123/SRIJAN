import { api, readJson } from "@/lib/server/api";
import { bookingView, creatorPublic, opsOverview } from "@/lib/domain/views";
import { setVerification } from "@/lib/domain/creators";
import { markPayoutPaid, payoutsDue } from "@/lib/domain/payouts";
import { markRefundSent, refundsDue } from "@/lib/domain/bookings";
import { canTakeJob, isCreatorBusy, jobService } from "@/lib/domain/dispatch";
import { haversineKm, DomainError } from "@/lib/domain/util";

const ACTIVE = ["searching", "needs_ops", "assigned", "delivered", "disputed"];
const needsAction = (status: string) => status === "needs_ops" || status === "disputed";

/** Everything the ops dashboard needs in one call. */
export async function GET() {
  return api(
    ({ db, now, viewer }) => {
      const active = db.bookings
        .filter((b) => ACTIVE.includes(b.status))
        .sort((a, b) => Number(needsAction(b.status)) - Number(needsAction(a.status)) || a.scheduledAt - b.scheduledAt);
      return {
        ...opsOverview(db, now),
        dispatch: active.map((b) => ({
          ...bookingView(db, b, viewer),
          // Who ops could assign by hand, nearest first.
          candidates:
            b.status === "searching" || b.status === "needs_ops"
              ? db.creators
                  .filter((c) => canTakeJob(c, jobService(b)) && !isCreatorBusy(db, c.id, b))
                  .map((c) => ({ id: c.id, name: c.name, available: c.available, km: b.online ? 0 : Math.round(haversineKm(c, b) * 10) / 10 }))
                  .sort((x, y) => x.km - y.km)
                  .slice(0, 8)
              : [],
        })),
        payoutsDue: payoutsDue(db),
        refundsDue: refundsDue(db),
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
  | { action: "mark_paid"; payoutId: string; reference?: string }
  | { action: "mark_refund_sent"; bookingId: string; reference?: string };

export async function POST(req: Request) {
  const body = await readJson<Action>(req);
  return api(
    ({ db, now }) => {
      switch (body.action) {
        case "verify":
          return setVerification(db, body.creatorId, body.decision, body.kycChecked === true);
        case "mark_paid":
          return markPayoutPaid(db, body.payoutId, body.reference, now);
        case "mark_refund_sent":
          markRefundSent(db, body.bookingId, body.reference, now);
          return { ok: true };
        default:
          throw new DomainError("Unknown action");
      }
    },
    { role: "ops" },
  );
}
