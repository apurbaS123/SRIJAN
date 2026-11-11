// The creator's wallet: a statement of what they have earned, nothing more.
//
// It holds no money and is not joined up to Razorpay. Every line is a `creator_earning` the ledger
// already recorded when a job was approved or a campaign settled, so the wallet can never disagree
// with the books. There is no withdraw button on purpose: Srijan sends the money to the bank account
// or UPI ID on the creator's profile, within PAYOUT_MIN_HOURS–PAYOUT_MAX_HOURS of a job being
// approved, and the line turns from "on the way" to "sent" once ops has paid it.

import { HOUR, PAYOUT_MAX_HOURS, PAYOUT_MIN_HOURS, PAYOUT_WINDOW_TEXT, findPackage } from "./config";
import { hasPayoutDetails } from "./creators";
import type { DB, LedgerEntry } from "./types";

function line(db: DB, l: LedgerEntry) {
  const booking = l.bookingId ? db.bookings.find((b) => b.id === l.bookingId) : undefined;
  const campaign = l.campaignId ? db.campaigns.find((c) => c.id === l.campaignId) : undefined;
  // "processing" is the only state that still owes the creator money. Entries from before payouts
  // were tracked have no status at all, and were settled outside the app — see payouts.ts.
  const onTheWay = l.status === "processing";
  return {
    id: l.id,
    /** When the job was approved (or the campaign settled) and the money became owed. */
    at: l.at,
    amount: l.amount,
    kind: campaign ? ("campaign" as const) : ("job" as const),
    /** What it was for: the job's package name, or the brand's name for a campaign. */
    title: campaign ? `Campaign · ${campaign.brandName}` : booking ? (findPackage(booking.packageId)?.name ?? l.note ?? "Job") : (l.note ?? "Job"),
    /** The job code, e.g. SR-2051, so a creator can match it to a job. */
    code: booking?.code ?? campaign?.code ?? l.note ?? "",
    bookingId: l.bookingId,
    /** "sent" once Srijan has paid it out; "on_the_way" while it's inside the payout window. */
    status: onTheWay ? ("on_the_way" as const) : ("sent" as const),
    sentAt: onTheWay ? undefined : l.paidAt,
    /** The bank or UPI reference ops noted when they sent it. */
    reference: onTheWay ? undefined : l.paymentRef,
    /** The far end of the payout window, while it's still on the way. */
    expectedBy: onTheWay ? l.at + PAYOUT_MAX_HOURS * HOUR : undefined,
  };
}
export type WalletLine = ReturnType<typeof line>;

/** Everything one creator has earned, newest first, with the totals shown at the top of the wallet. */
export function walletFor(db: DB, creatorId: string) {
  const creator = db.creators.find((c) => c.id === creatorId);
  const lines = db.ledger
    .filter((l) => l.type === "creator_earning" && l.creatorId === creatorId)
    .sort((a, b) => b.at - a.at)
    .map((l) => line(db, l));
  const total = (status: WalletLine["status"]) => lines.filter((l) => l.status === status).reduce((s, l) => s + l.amount, 0);
  const sent = total("sent");
  const onTheWay = total("on_the_way");
  return {
    totals: {
      /** Everything ever earned through Srijan. */
      earned: sent + onTheWay,
      /** Already paid out. */
      sent,
      /** Approved and inside the payout window. */
      onTheWay,
      jobsPaid: lines.length,
    },
    /** Where the money is going. Null until the creator adds a payment receive method. */
    hasPayoutMethod: !!creator && hasPayoutDetails(creator),
    payoutWindowText: PAYOUT_WINDOW_TEXT,
    minHours: PAYOUT_MIN_HOURS,
    maxHours: PAYOUT_MAX_HOURS,
    lines,
  };
}
export type Wallet = ReturnType<typeof walletFor>;
