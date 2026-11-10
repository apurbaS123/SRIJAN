import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { approve, cancelByClient, clientRating, createBooking, markFinished, recordPayment, refund, releaseDisputed, reportProblem, reviewClient, reviewCreator } from "@/lib/domain/bookings";
import { acceptOffer } from "@/lib/domain/dispatch";
import { tickAll } from "@/lib/domain/views";
import { markPayoutPaid, payoutsDue } from "@/lib/domain/payouts";
import { campaignMath, inviteCreator, respondToInvite, settleCampaign, updateCampaign } from "@/lib/domain/campaigns";
import { CREATOR_SHARE, HOUR, lowestPrice, MIN, PACKAGES, sellable } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST
const JOB = { packageId: "video_milestone", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" };

function paid(db: DB) {
  const b = createBooking(db, "u_priya", JOB, T0);
  recordPayment(db, b, "pay_test1", T0);
  return b;
}

function bookedAndAccepted(db: DB) {
  const b = paid(db);
  const o = db.offers.find((x) => x.bookingId === b.id && x.creatorId === "cr_ankita")!;
  acceptOffer(db, o.id, "cr_ankita", T0 + MIN);
  return b;
}

function finished(db: DB) {
  const b = bookedAndAccepted(db);
  markFinished(db, b.id, "cr_ankita", SHOOT + 5 * HOUR);
  return b;
}

const ledger = (db: DB, bookingId: string, type: string) =>
  db.ledger.filter((l) => l.bookingId === bookingId && l.type === type).reduce((s, l) => s + l.amount, 0);

describe("paying for a job", () => {
  it("charges exactly the package price, with no GST", () => {
    const b = createBooking(seedDb(T0), "u_priya", JOB, T0);
    expect(b.total).toBe(2499);
  });

  it("alerts nobody until the payment is confirmed", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", JOB, T0);
    expect(b.status).toBe("awaiting_payment");
    expect(db.offers.filter((o) => o.bookingId === b.id)).toEqual([]);
    expect(ledger(db, b.id, "client_payment")).toBe(0);
    expect(recordPayment(db, b, "pay_1", T0)).toBe("paid");
    expect(b.status).toBe("searching");
    expect(db.offers.filter((o) => o.bookingId === b.id).length).toBeGreaterThan(0);
    expect(ledger(db, b.id, "client_payment")).toBe(2499);
  });

  it("counts a payment once when checkout and the webhook both report it", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", JOB, T0);
    recordPayment(db, b, "pay_1", T0);
    const offers = db.offers.length;
    expect(recordPayment(db, b, "pay_1", T0 + 1000)).toBe("already");
    expect(ledger(db, b.id, "client_payment")).toBe(2499);
    expect(db.offers.length).toBe(offers);
  });

  it("drops an unpaid booking after 30 minutes and refunds a payment that lands later", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", JOB, T0);
    tickAll(db, T0 + 29 * MIN);
    expect(b.status).toBe("awaiting_payment");
    tickAll(db, T0 + 30 * MIN);
    expect(b.status).toBe("cancelled");
    expect(recordPayment(db, b, "pay_late", T0 + 31 * MIN)).toBe("refund");
    expect(b.status).toBe("refunded");
    expect(b.refund).toMatchObject({ amount: 2499, status: "pending" });
    expect(db.offers.filter((o) => o.bookingId === b.id)).toEqual([]);
  });

  it("sets up a real refund when a paid client cancels, and can't refund twice", () => {
    const db = seedDb(T0);
    const b = paid(db);
    cancelByClient(db, b.id, "u_priya", T0 + MIN);
    expect(b.status).toBe("cancelled");
    expect(b.refund).toMatchObject({ amount: 2499, status: "pending" });
    expect(() => refund(db, b, "again", T0 + 2 * MIN)).toThrow(/can’t be refunded/);
    expect(ledger(db, b.id, "client_refund")).toBe(2499);
  });
});

describe("the service menu", () => {
  const sold = sellable();

  it("sells the 31 services from the pricing matrices", () => {
    expect(sold.filter((p) => !p.online)).toHaveLength(15);
    expect(sold.filter((p) => p.online)).toHaveLength(16);
    expect(new Set(sold.map((p) => p.id)).size).toBe(sold.length);
  });

  it("gives the creator the net shown in the matrices", () => {
    const net = (price: number) => Math.round(price * CREATOR_SHARE);
    expect([799, 899, 999, 1199, 1299, 1499, 1999, 2499, 2999, 3499, 3999, 5999, 6499].map(net)).toEqual([639, 719, 799, 959, 1039, 1199, 1599, 1999, 2399, 2799, 3199, 4799, 5199]);
  });

  it("charges exactly the listed price, with no travel fee", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", { ...JOB, packageId: "photo_click_drop" }, T0);
    expect(b.total).toBe(1999);
  });

  it("keeps the ₹1 payment test bookable but out of the prices quoted to clients", () => {
    const drone = PACKAGES.find((p) => p.id === "video_drone")!;
    expect(drone.price).toBe(1);
    expect(drone.retired).toBeUndefined();
    expect(sellable()).not.toContain(drone);
    expect(lowestPrice("videography")).toBe(999);
  });

  it("refuses a service that is no longer sold", () => {
    const db = seedDb(T0);
    expect(() => createBooking(db, "u_priya", { ...JOB, packageId: "quick_reel" }, T0)).toThrow(/Unknown package/);
  });
});

describe("finishing and approving a job", () => {
  it("owes the creator 80% and keeps 20% once the client approves", () => {
    const db = seedDb(T0);
    const b = bookedAndAccepted(db);
    markFinished(db, b.id, "cr_ankita", SHOOT + HOUR);
    expect(b.status).toBe("delivered");
    expect(ledger(db, b.id, "creator_earning")).toBe(0);
    approve(db, b.id, "u_priya", SHOOT + 2 * HOUR);
    expect(b.status).toBe("completed");
    expect(ledger(db, b.id, "creator_earning")).toBe(1999);
    expect(ledger(db, b.id, "platform_fee")).toBe(500);
  });

  it("won't let a creator finish an on-site job before it starts, or someone else's", () => {
    const db = seedDb(T0);
    const b = bookedAndAccepted(db);
    expect(() => markFinished(db, b.id, "cr_ankita", SHOOT - MIN)).toThrow(/start time/);
    expect(() => markFinished(db, b.id, "cr_rituraj", SHOOT + HOUR)).toThrow(/not found/);
    expect(() => approve(db, b.id, "u_priya", SHOOT + HOUR)).toThrow(/nothing to approve/);
  });

  it("only the booking's own client can approve", () => {
    const db = seedDb(T0);
    const b = finished(db);
    expect(() => approve(db, b.id, "u_other", SHOOT + 6 * HOUR)).toThrow(/not found/);
  });

  it("auto-approves 48 hours after the job is finished", () => {
    const db = seedDb(T0);
    const b = finished(db);
    tickAll(db, SHOOT + 5 * HOUR + 47 * HOUR);
    expect(b.status).toBe("delivered");
    tickAll(db, SHOOT + 5 * HOUR + 48 * HOUR);
    expect(b.status).toBe("completed");
    expect(b.autoApproved).toBe(true);
    expect(ledger(db, b.id, "creator_earning")).toBe(1999);
  });

  it("stops the payout when the client reports a problem, until ops decides", () => {
    const db = seedDb(T0);
    const b = finished(db);
    expect(() => reportProblem(db, b.id, "u_priya", "  ", SHOOT + 6 * HOUR)).toThrow(/Enter the problem/);
    reportProblem(db, b.id, "u_priya", "The creator never came", SHOOT + 6 * HOUR);
    expect(b.status).toBe("disputed");
    tickAll(db, SHOOT + 100 * HOUR);
    expect(b.status).toBe("disputed");
    expect(ledger(db, b.id, "creator_earning")).toBe(0);
    releaseDisputed(db, b, SHOOT + 101 * HOUR);
    expect(b.status).toBe("completed");
    expect(ledger(db, b.id, "creator_earning")).toBe(1999);
  });

  it("can refund a reported job instead, and then owes the creator nothing", () => {
    const db = seedDb(T0);
    const b = finished(db);
    reportProblem(db, b.id, "u_priya", "The creator never came", SHOOT + 6 * HOUR);
    refund(db, b, "creator didn't do the job", SHOOT + 7 * HOUR);
    expect(b.status).toBe("refunded");
    expect(ledger(db, b.id, "creator_earning")).toBe(0);
    expect(payoutsDue(db)).toEqual([]);
  });
});

describe("manual payouts", () => {
  it("lists what's owed with the creator's details until ops marks it paid", () => {
    const db = seedDb(T0);
    const b = finished(db);
    approve(db, b.id, "u_priya", SHOOT + 6 * HOUR);
    const [due] = payoutsDue(db);
    expect(due).toMatchObject({ amount: 1999, creatorName: "Ankita Baruah", method: "upi", upiId: "ankita@okaxis", bookingId: b.id });
    markPayoutPaid(db, due!.id, "UTR123", SHOOT + 7 * HOUR);
    expect(payoutsDue(db)).toEqual([]);
    expect(db.ledger.find((l) => l.id === due!.id)).toMatchObject({ status: "paid", paymentRef: "UTR123", paidAt: SHOOT + 7 * HOUR });
    expect(() => markPayoutPaid(db, due!.id, "", SHOOT + 8 * HOUR)).toThrow(/already/);
  });

  it("doesn't treat old wallet earnings as owed", () => {
    expect(payoutsDue(seedDb(T0))).toEqual([]);
  });
});

describe("reviews", () => {
  it("lets each side review once, only after completion", () => {
    const db = seedDb(T0);
    const b = finished(db);
    const ankita = db.creators.find((c) => c.id === "cr_ankita")!;
    const before = { sum: ankita.ratingSum, count: ankita.ratingCount };
    expect(() => reviewCreator(db, b.id, "u_priya", 5, "", SHOOT + 6 * HOUR)).toThrow(/completed/);
    approve(db, b.id, "u_priya", SHOOT + 6 * HOUR);

    expect(() => reviewCreator(db, b.id, "u_priya", 0, "", SHOOT + 7 * HOUR)).toThrow(/1 to 5/);
    expect(() => reviewCreator(db, b.id, "u_priya", 4.5, "", SHOOT + 7 * HOUR)).toThrow(/1 to 5/);
    expect(() => reviewCreator(db, b.id, "u_other", 5, "", SHOOT + 7 * HOUR)).toThrow(/not found/);
    reviewCreator(db, b.id, "u_priya", 4, "  ", SHOOT + 7 * HOUR);
    expect(b.rating).toBe(4);
    expect(b.review).toBeUndefined();
    expect(ankita.ratingSum).toBe(before.sum + 4);
    expect(ankita.ratingCount).toBe(before.count + 1);
    expect(() => reviewCreator(db, b.id, "u_priya", 5, "", SHOOT + 8 * HOUR)).toThrow(/already/);

    expect(() => reviewClient(db, b.id, "cr_rituraj", 5, "", SHOOT + 7 * HOUR)).toThrow(/not found/);
    reviewClient(db, b.id, "cr_ankita", 5, "Clear brief, on time", SHOOT + 7 * HOUR);
    expect(b.reviewOfClient).toEqual({ rating: 5, text: "Clear brief, on time", at: SHOOT + 7 * HOUR });
    expect(() => reviewClient(db, b.id, "cr_ankita", 3, "", SHOOT + 8 * HOUR)).toThrow(/already/);
    expect(clientRating(db, "u_priya")).toEqual({ rating: 5, count: 1 });
  });

  it("can review an auto-approved booking", () => {
    const db = seedDb(T0);
    const b = finished(db);
    tickAll(db, SHOOT + 5 * HOUR + 48 * HOUR);
    expect(b.autoApproved).toBe(true);
    reviewCreator(db, b.id, "u_priya", 2, "Late and blurry", SHOOT + 60 * HOUR);
    expect(b.review).toBe("Late and blurry");
  });
});

describe("campaigns", () => {
  it("keeps creator fees inside the pool and books Srijan's share on settle", () => {
    const db = seedDb(T0);
    const c = db.campaigns.find((x) => x.id === "cmp_fashion")!;
    const m = campaignMath(c);
    expect(m.commission).toBe(87500);
    expect(m.creatorPool).toBe(162500);
    const result = settleCampaign(db, c.id, T0);
    expect(result.paid).toBe(32000);
    expect(result.srijanKeeps).toBe(218000);
    expect(c.stage).toBe("closed");
    expect(payoutsDue(db).map((p) => [p.creatorName, p.amount])).toEqual([["Lalremruati", 20000], ["Rituraj Das", 12000]]);
  });

  it("rejects commission outside 30–35% and over-budget invites", () => {
    const db = seedDb(T0);
    expect(() => updateCampaign(db, "cmp_tea", { commissionRate: 0.4 })).toThrow(/between/);
    expect(() => inviteCreator(db, "cmp_tea", "cr_rituraj", "1 reel", 500000, T0)).toThrow(/left in the creator pool/);
    inviteCreator(db, "cmp_tea", "cr_rituraj", "1 reel", 12000, T0);
    respondToInvite(db, "cmp_tea", "cr_rituraj", true);
    expect(db.campaigns.find((x) => x.id === "cmp_tea")!.creators.find((x) => x.creatorId === "cr_rituraj")!.status).toBe("accepted");
  });
});
