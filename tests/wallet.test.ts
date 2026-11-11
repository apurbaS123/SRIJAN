import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { approve, createBooking, markFinished, recordPayment } from "@/lib/domain/bookings";
import { acceptOffer } from "@/lib/domain/dispatch";
import { markPayoutPaid } from "@/lib/domain/payouts";
import { updateOwnCreator } from "@/lib/domain/creators";
import { settleCampaign } from "@/lib/domain/campaigns";
import { walletFor } from "@/lib/domain/wallet";
import { CREATOR_SHARE, HOUR, MIN, PAYOUT_MAX_HOURS } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST
const APPROVED = SHOOT + 6 * HOUR;
const JOB = { packageId: "video_milestone", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" };

/** One job through to approved, taken by Ankita. */
function approvedJob(db: DB) {
  const b = createBooking(db, "u_priya", JOB, T0);
  const o = db.offers.find((x) => x.bookingId === b.id && x.creatorId === "cr_ankita")!;
  acceptOffer(db, o.id, "cr_ankita", T0 + MIN);
  recordPayment(db, b, "pay_1", T0 + 2 * MIN);
  markFinished(db, b.id, "cr_ankita", SHOOT + 5 * HOUR);
  approve(db, b.id, "u_priya", APPROVED);
  return b;
}

describe("creator wallet", () => {
  it("is empty for a creator who hasn’t earned anything", () => {
    const db = seedDb(T0);
    const w = walletFor(db, "cr_mridul");
    expect(w.lines).toEqual([]);
    expect(w.totals).toMatchObject({ earned: 0, sent: 0, onTheWay: 0, jobsPaid: 0 });
  });

  it("shows an approved job as on the way, with the date it should arrive by", () => {
    const db = seedDb(T0);
    const b = approvedJob(db);
    const w = walletFor(db, "cr_ankita");
    const line = w.lines.find((l) => l.bookingId === b.id)!;
    expect(line).toMatchObject({
      status: "on_the_way",
      amount: Math.round(b.price * CREATOR_SHARE),
      code: b.code,
      kind: "job",
      at: APPROVED,
      expectedBy: APPROVED + PAYOUT_MAX_HOURS * HOUR,
    });
    const before = walletFor(seedDb(T0), "cr_ankita").totals;
    expect(w.totals.onTheWay).toBe(before.onTheWay + line.amount);
    expect(w.totals.earned).toBe(before.earned + line.amount);
    expect(w.payoutWindowText).toMatch(/48 to 72 hours/);
  });

  it("turns the line into ‘sent’ once ops has paid it, with their reference", () => {
    const db = seedDb(T0);
    approvedJob(db);
    const owed = db.ledger.find((l) => l.type === "creator_earning" && l.status === "processing" && l.creatorId === "cr_ankita")!;
    markPayoutPaid(db, owed.id, "UTR12345", APPROVED + 50 * HOUR);

    const w = walletFor(db, "cr_ankita");
    const line = w.lines[0]!;
    expect(line).toMatchObject({ status: "sent", sentAt: APPROVED + 50 * HOUR, reference: "UTR12345" });
    expect(line.expectedBy).toBeUndefined();
    const before = walletFor(seedDb(T0), "cr_ankita").totals;
    expect(w.totals.sent).toBe(before.sent + line.amount);
    expect(w.totals.onTheWay).toBe(before.onTheWay);
  });

  it("holds nothing of its own: every line comes from the ledger, newest first", () => {
    const db = seedDb(T0);
    approvedJob(db);
    const w = walletFor(db, "cr_ankita");
    const fromLedger = db.ledger.filter((l) => l.type === "creator_earning" && l.creatorId === "cr_ankita");
    expect(w.lines.length).toBe(fromLedger.length);
    expect(w.totals.earned).toBe(fromLedger.reduce((s, l) => s + l.amount, 0));
    expect(w.lines.map((l) => l.at)).toEqual([...w.lines.map((l) => l.at)].sort((a, b) => b - a));
  });

  it("includes campaign fees alongside job earnings", () => {
    const db = seedDb(T0);
    // cmp_fashion is already at "Report & settle" with Rituraj accepted on a ₹12,000 fee.
    const c = db.campaigns.find((x) => x.id === "cmp_fashion")!;
    settleCampaign(db, c.id, T0 + 10 * HOUR);

    const w = walletFor(db, "cr_rituraj");
    const campaign = w.lines.find((l) => l.kind === "campaign")!;
    expect(campaign).toMatchObject({ amount: 12000, status: "on_the_way", at: T0 + 10 * HOUR });
    expect(campaign.title).toContain(c.brandName);
    expect(campaign.bookingId).toBeUndefined();
  });

  it("says whether there is anywhere to send the money", () => {
    const db = seedDb(T0);
    // Ankita has a UPI ID in the fixture; Mridul has nothing.
    expect(walletFor(db, "cr_ankita").hasPayoutMethod).toBe(true);
    expect(walletFor(db, "cr_mridul").hasPayoutMethod).toBe(false);
    db.creators.find((x) => x.id === "cr_mridul")!.verification = "verified";
    updateOwnCreator(db, "cr_mridul", { payout: { method: "upi", upiId: "mridul@okaxis" } });
    expect(walletFor(db, "cr_mridul").hasPayoutMethod).toBe(true);
  });

  it("never leaks the creator’s bank or UPI details", () => {
    const db = seedDb(T0);
    db.creators.find((x) => x.id === "cr_ankita")!.upiId = "ankita@okaxis";
    approvedJob(db);
    expect(JSON.stringify(walletFor(db, "cr_ankita"))).not.toContain("ankita@okaxis");
  });
});
