// Creator payouts are manual for now: when a job is approved (or a campaign settles) the amount is
// owed, ops sends it by bank or UPI and marks it paid. To automate, send the money in `markPayoutPaid`.
import type { DB, LedgerEntry } from "./types";
import { assert, cleanText } from "./util";

const isOwed = (l: LedgerEntry) => l.type === "creator_earning" && l.status === "processing";

/** For the ops page only: this includes full bank details. */
export function payoutsDue(db: DB) {
  return db.ledger.filter(isOwed).map((l) => {
    const c = db.creators.find((x) => x.id === l.creatorId);
    const phone = db.users.find((u) => u.id === c?.userId)?.phone;
    return {
      id: l.id,
      at: l.at,
      amount: l.amount,
      note: l.note ?? "",
      bookingId: l.bookingId,
      creatorName: c?.name ?? "Creator",
      creatorPhone: phone,
      method: c?.payoutMethod === "bank" && c.bank ? ("bank" as const) : c?.upiId ? ("upi" as const) : null,
      upiId: c?.upiId,
      bank: c?.bank,
    };
  });
}
export type PayoutDue = ReturnType<typeof payoutsDue>[number];

export function markPayoutPaid(db: DB, ledgerId: string, reference: unknown, now: number) {
  const l = db.ledger.find((x) => x.id === ledgerId);
  assert(l && l.type === "creator_earning", "Payout not found", 404);
  assert(l.status === "processing", "This payout is already marked as paid", 409);
  l.status = "paid";
  l.paidAt = now;
  l.paymentRef = cleanText(reference, 100, "the payment reference", true) || undefined;
  return l;
}
