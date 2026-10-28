import { CREATOR_SHARE, PAYOUT } from "./config";
import type { DB } from "./types";
import { assert, newId, rupees } from "./util";

export function creatorWallet(db: DB, creatorId: string) {
  const entries = db.ledger.filter((l) => l.creatorId === creatorId);
  const earned = entries.filter((l) => l.type === "creator_earning").reduce((s, l) => s + l.amount, 0);
  const withdrawn = entries.filter((l) => l.type === "withdrawal").reduce((s, l) => s + l.amount + (l.fee ?? 0), 0);
  const pendingBookings = db.bookings.filter(
    (b) => b.creatorId === creatorId && ["assigned", "shooting", "editing", "delivered", "revision_requested"].includes(b.status),
  );
  const onHold = pendingBookings.reduce((s, b) => s + rupees(b.price * CREATOR_SHARE), 0);
  return {
    available: earned - withdrawn,
    onHold,
    earned,
    withdrawn,
    entries: entries.sort((a, b) => b.at - a.at),
  };
}

export function withdraw(db: DB, creatorId: string, amount: number, instant: boolean, now: number) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  assert(c.upiId, "Add your UPI ID before withdrawing");
  const amt = Math.floor(Number(amount));
  const fee = instant ? PAYOUT.instantFee : 0;
  const w = creatorWallet(db, creatorId);
  assert(amt >= PAYOUT.minWithdrawal, `Minimum withdrawal is ₹${PAYOUT.minWithdrawal}`);
  assert(amt + fee <= w.available, "That’s more than your available balance");
  const entry = {
    id: newId("led"),
    at: now,
    type: "withdrawal" as const,
    amount: amt,
    fee,
    creatorId,
    status: instant ? ("paid" as const) : ("processing" as const),
    note: instant ? `Instant to ${c.upiId}` : `Friday payout to ${c.upiId}`,
  };
  db.ledger.push(entry);
  return entry;
}

/** Ops marks all queued weekly withdrawals as paid. */
export function runPayouts(db: DB) {
  const queued = db.ledger.filter((l) => l.type === "withdrawal" && l.status === "processing");
  for (const l of queued) l.status = "paid";
  return { count: queued.length, total: queued.reduce((s, l) => s + l.amount, 0) };
}
