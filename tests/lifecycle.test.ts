import { describe, expect, it } from "vitest";
import { seedDb } from "@/lib/domain/seed";
import { approve, checkIn, createBooking, deliver, finishShoot, requestRevision } from "@/lib/domain/bookings";
import { acceptOffer } from "@/lib/domain/dispatch";
import { tickAll } from "@/lib/domain/views";
import { creatorWallet, withdraw } from "@/lib/domain/wallet";
import { campaignMath, inviteCreator, respondToInvite, settleCampaign, updateCampaign } from "@/lib/domain/campaigns";
import { HOUR, MIN } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST

function bookedAndAccepted(db: DB) {
  const b = createBooking(
    db,
    "u_priya",
    { packageId: "quick_reel", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" },
    T0,
  );
  const o = db.offers.find((x) => x.bookingId === b.id && x.creatorId === "cr_ankita")!;
  acceptOffer(db, o.id, "cr_ankita", T0 + MIN);
  return b;
}

const ledger = (db: DB, bookingId: string, type: string) =>
  db.ledger.filter((l) => l.bookingId === bookingId && l.type === type).reduce((s, l) => s + l.amount, 0);

describe("shoot lifecycle and money", () => {
  it("pays 80/20 with GST recorded when delivered on time", () => {
    const db = seedDb(T0);
    const b = bookedAndAccepted(db);
    expect(b.total).toBe(2950);
    expect(() => checkIn(db, b.id, "cr_ankita", "0000", b, SHOOT)).toThrow(/start code/);
    expect(() => checkIn(db, b.id, "cr_ankita", b.otp, { lat: b.lat + 0.01, lng: b.lng }, SHOOT)).toThrow(/from the address/);
    checkIn(db, b.id, "cr_ankita", b.otp, { lat: b.lat + 0.001, lng: b.lng }, SHOOT);
    finishShoot(db, b.id, "cr_ankita", SHOOT + 2 * HOUR);
    deliver(db, b.id, "cr_ankita", "https://drive.example.com/v1", SHOOT + 8 * HOUR);
    approve(db, b.id, "u_priya", 5, "Lovely", SHOOT + 9 * HOUR);
    expect(b.status).toBe("completed");
    expect(ledger(db, b.id, "creator_earning")).toBe(2000);
    expect(ledger(db, b.id, "platform_fee")).toBe(500);
    expect(ledger(db, b.id, "gst_collected")).toBe(450);
    expect(ledger(db, b.id, "client_refund")).toBe(0);
  });

  it("cuts the creator payout 10% per 6 h late and credits the client", () => {
    const db = seedDb(T0);
    const b = bookedAndAccepted(db);
    checkIn(db, b.id, "cr_ankita", b.otp, b, SHOOT);
    finishShoot(db, b.id, "cr_ankita", SHOOT + HOUR);
    deliver(db, b.id, "cr_ankita", "https://drive.example.com/v1", SHOOT + 24 * HOUR + 7 * HOUR);
    expect(b.latePenaltyPct).toBe(20);
    approve(db, b.id, "u_priya", 4, undefined, SHOOT + 32 * HOUR);
    expect(ledger(db, b.id, "creator_earning")).toBe(1600);
    expect(ledger(db, b.id, "client_refund")).toBe(400);
    expect(ledger(db, b.id, "platform_fee")).toBe(500);
  });

  it("allows one free revision and auto-approves 48 h after delivery", () => {
    const db = seedDb(T0);
    const b = bookedAndAccepted(db);
    checkIn(db, b.id, "cr_ankita", b.otp, b, SHOOT);
    finishShoot(db, b.id, "cr_ankita", SHOOT + HOUR);
    deliver(db, b.id, "cr_ankita", "https://drive.example.com/v1", SHOOT + 5 * HOUR);
    requestRevision(db, b.id, "u_priya", "Use a brighter colour grade", SHOOT + 6 * HOUR);
    deliver(db, b.id, "cr_ankita", "https://drive.example.com/v2", SHOOT + 10 * HOUR);
    expect(() => requestRevision(db, b.id, "u_priya", "Again please", SHOOT + 11 * HOUR)).toThrow(/free revision/);
    tickAll(db, SHOOT + 10 * HOUR + 48 * HOUR);
    expect(b.status).toBe("completed");
    expect(b.autoApproved).toBe(true);
  });

  it("lets a creator withdraw only what has been released", () => {
    const db = seedDb(T0);
    const w = creatorWallet(db, "cr_ankita");
    expect(w.available).toBe(4400);
    expect(() => withdraw(db, "cr_ankita", 5000, false, T0)).toThrow(/available/);
    withdraw(db, "cr_ankita", 4390, true, T0);
    expect(creatorWallet(db, "cr_ankita").available).toBe(0);
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
    expect(creatorWallet(db, "cr_lalrem").available).toBe(20000);
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
