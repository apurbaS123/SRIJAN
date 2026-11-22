import { api, readJson } from "@/lib/server/api";
import { bookingView, creatorPublic, opsOverview } from "@/lib/domain/views";
import { deleteBlocker, deleteCreator, setVerification, updateCreatorByOps, type OpsCreatorPatch } from "@/lib/domain/creators";
import { deleteDocuments } from "@/lib/server/uploads";
import { kycSummary } from "@/lib/domain/kyc";
import { markPayoutPaid, payoutsDue } from "@/lib/domain/payouts";
import { markRefundSent, refundsDue } from "@/lib/domain/bookings";
import { canTakeJob, isCreatorBusy, jobService } from "@/lib/domain/dispatch";
import { haversineKm, DomainError } from "@/lib/domain/util";

const ACTIVE = ["searching", "needs_ops", "awaiting_payment", "assigned", "delivered", "disputed"];
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
            return { ...creatorPublic(c), kyc: kycSummary(c), phone: u?.phone, email: u?.email };
          }),
        // Everyone already dealt with, verified or sent back. The ones still waiting are above, and
        // this list is also what Creators is edited and tidied from, so it carries contact details.
        creators: db.creators
          .filter((c) => c.verification !== "pending")
          .map((c) => {
            const u = db.users.find((x) => x.id === c.userId);
            return { ...creatorPublic(c), phone: u?.phone, email: u?.email, jobs: db.bookings.filter((b) => b.creatorId === c.id).length, blocker: deleteBlocker(db, c.id) };
          }),
      };
    },
    { role: "ops", read: true },
  );
}

type Action =
  | { action: "verify"; creatorId: string; decision: "verified" | "rejected"; kycChecked?: boolean; note?: string }
  | { action: "mark_paid"; payoutId: string; reference?: string }
  | { action: "mark_refund_sent"; bookingId: string; reference?: string }
  | { action: "edit_creator"; creatorId: string; patch: OpsCreatorPatch }
  | { action: "delete_creator"; creatorId: string };

export async function POST(req: Request) {
  const body = await readJson<Action>(req);
  // Filled in while the database is locked, deleted after the reply: the document store is a
  // separate thing to talk to and nothing slow belongs inside the lock.
  let orphaned: string[] = [];
  const res = await api(
    ({ db, now, user }) => {
      switch (body.action) {
        case "verify": {
          // `user.name` is recorded on the creator's Aadhaar, so there is a name against the decision.
          const c = setVerification(db, body.creatorId, body.decision, body.kycChecked === true, body.note, user?.name, now);
          // The dashboard only needs to see the outcome, and the raw record holds the creator's
          // bank details and the hash of their Aadhaar number.
          return { ...creatorPublic(c), kyc: kycSummary(c) };
        }
        case "mark_paid":
          return markPayoutPaid(db, body.payoutId, body.reference, now);
        case "mark_refund_sent":
          markRefundSent(db, body.bookingId, body.reference, now);
          return { ok: true };
        case "edit_creator": {
          // Narrower than what a creator may change about themselves: no bank details, no Aadhaar,
          // and no way to make somebody verified. See `updateCreatorByOps`.
          const out = updateCreatorByOps(db, body.creatorId, body.patch ?? {});
          orphaned = out.orphaned;
          return { ...creatorPublic(out.creator), kyc: kycSummary(out.creator) };
        }
        case "delete_creator": {
          // Refuses outright while there is live work or unpaid money. See `deleteBlocker`.
          const out = deleteCreator(db, body.creatorId);
          orphaned = out.documents;
          return out.removed;
        }
        default:
          throw new DomainError("Unknown action");
      }
    },
    { role: "ops" },
  );
  if (res.status === 200 && orphaned.length) void deleteDocuments(orphaned);
  return res;
}
