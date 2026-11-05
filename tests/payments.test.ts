import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDb } from "./fixtures/seed";
import { updateOwnCreator, hasPayoutDetails, payoutSummary, signUpCreator } from "@/lib/domain/creators";
import { checkoutSignatureValid, createOrder, webhookSignatureValid } from "@/lib/server/razorpay";
import { bookingView, creatorPublic, tickAll } from "@/lib/domain/views";
import { acceptOffer } from "@/lib/domain/dispatch";
import { SERVICES, lowestPrice } from "@/lib/domain/config";
import { createBooking, createBookings, markRefundSent, recordPayment, refund, refundsDue } from "@/lib/domain/bookings";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const hmac = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

describe("Razorpay signatures", () => {
  beforeEach(() => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "key-secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "hook-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only a checkout reply signed for this order", () => {
    const good = hmac("key-secret", "order_1|pay_1");
    expect(checkoutSignatureValid("order_1", "pay_1", good)).toBe(true);
    expect(checkoutSignatureValid("order_2", "pay_1", good)).toBe(false);
    expect(checkoutSignatureValid("order_1", "pay_2", good)).toBe(false);
    expect(checkoutSignatureValid("order_1", "pay_1", "nonsense")).toBe(false);
    expect(checkoutSignatureValid("order_1", "pay_1", undefined)).toBe(false);
  });

  it("checks webhooks against the exact bytes sent", () => {
    const raw = '{"event":"payment.captured"}';
    expect(webhookSignatureValid(raw, hmac("hook-secret", raw))).toBe(true);
    expect(webhookSignatureValid(`${raw} `, hmac("hook-secret", raw))).toBe(false);
    expect(webhookSignatureValid(raw, hmac("key-secret", raw))).toBe(false);
  });

  it("fails closed when the secrets aren't set", async () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(checkoutSignatureValid("order_1", "pay_1", hmac("", "order_1|pay_1"))).toBe(false);
    expect(webhookSignatureValid("{}", hmac("", "{}"))).toBe(false);
    await expect(createOrder(100, "r", {})).rejects.toThrow(/isn’t set up/);
  });
});

describe("creator bank and UPI details", () => {
  const fresh = () => {
    const db = seedDb(T0);
    const { creator } = signUpCreator(db, { name: "New Creator", phone: "9876511111", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" }], onDemand: true }, { email: "new@example.com", phone: "9876511111" }, T0);
    return { db, creator };
  };
  const bank = { method: "bank" as const, accountName: "New Creator", accountNumber: "123456789012", ifsc: "sbin0001234" };

  it("starts with nothing linked, and stays offline until it's linked", () => {
    const { db, creator } = fresh();
    expect(hasPayoutDetails(creator)).toBe(false);
    creator.verification = "verified";
    expect(() => updateOwnCreator(db, creator.id, { available: true })).toThrow(/bank account or UPI/);
    updateOwnCreator(db, creator.id, { payout: { method: "upi", upiId: "new@okaxis" } });
    updateOwnCreator(db, creator.id, { available: true });
    expect(creator.available).toBe(true);
  });

  it("validates what's entered", () => {
    const { db, creator } = fresh();
    expect(() => updateOwnCreator(db, creator.id, { payout: { method: "upi", upiId: "not-a-upi" } })).toThrow(/UPI ID/);
    expect(() => updateOwnCreator(db, creator.id, { payout: { ...bank, accountNumber: "12" } })).toThrow(/9 to 18/);
    expect(() => updateOwnCreator(db, creator.id, { payout: { ...bank, ifsc: "BAD" } })).toThrow(/IFSC/);
    expect(() => updateOwnCreator(db, creator.id, { payout: { method: "cash" as never } })).toThrow(/bank account or UPI/);
  });

  it("keeps one method at a time and only shows the creator the last 4 digits", () => {
    const { db, creator } = fresh();
    updateOwnCreator(db, creator.id, { payout: { method: "upi", upiId: "new@okaxis" } });
    updateOwnCreator(db, creator.id, { payout: bank });
    expect(creator.upiId).toBeUndefined();
    expect(creator.bank?.ifsc).toBe("SBIN0001234");
    expect(payoutSummary(creator)).toEqual({ method: "bank", accountName: "New Creator", accountLast4: "9012", ifsc: "SBIN0001234" });
    updateOwnCreator(db, creator.id, { payout: { method: "upi", upiId: "new@okaxis" } });
    expect(creator.bank).toBeUndefined();
  });

  it("never puts bank or UPI details on the public profile or the job", () => {
    const { db, creator } = fresh();
    updateOwnCreator(db, creator.id, { payout: bank });
    expect(JSON.stringify(creatorPublic(creator))).not.toContain("123456789012");

    const b = createBooking(db, "u_priya", { packageId: "video_milestone", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" }, T0);
    recordPayment(db, b, "pay_1", T0);
    b.creatorId = creator.id;
    const seen = JSON.stringify(bookingView(db, b, { userId: "u_priya", role: "client" }));
    expect(seen).not.toContain("123456789012");
  });
});

describe("who sees which phone number", () => {
  it("shares the client's number only with the creator who took the job", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", { packageId: "edit_reel", scheduledAt: "2026-10-26T15:00", brief: "Edit my café clips into one reel" }, T0);
    recordPayment(db, b, "pay_1", T0);
    const asRituraj = { userId: "u_rituraj", role: "creator" as const, creatorId: "cr_rituraj" };
    const asAnkita = { userId: "u_ankita", role: "creator" as const, creatorId: "cr_ankita" };
    expect(bookingView(db, b, asRituraj).clientPhone).toBeUndefined();

    const o = db.offers.find((x) => x.bookingId === b.id && x.creatorId === "cr_rituraj")!;
    acceptOffer(db, o.id, "cr_rituraj", T0 + 60_000);
    const phone = db.users.find((u) => u.id === "u_priya")!.phone;
    expect(phone).toBeTruthy();
    expect(bookingView(db, b, asRituraj).clientPhone).toBe(phone);
    expect(bookingView(db, b, asAnkita).clientPhone).toBeUndefined();

    const client = bookingView(db, b, { userId: "u_priya", role: "client" });
    expect(client.clientPhone).toBe(phone);
    expect(client.creatorPhone).toBe("+91 98640 22222");
    expect(bookingView(db, b, asAnkita).creatorPhone).toBeUndefined();
  });
});

describe("the videography service title", () => {
  it("renames saved profiles and uses the new title for new creators", () => {
    const db = seedDb(T0);
    db.creators[0]!.services = [{ key: "videography", title: "1-day shoot", description: "x", price: 2500 }];
    tickAll(db, T0);
    expect(db.creators[0]!.services[0]!.title).toBe("1-day service");
    const { creator } = signUpCreator(db, { name: "New Creator", phone: "9876511111", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" }], onDemand: true }, { email: "title@example.com", phone: "9876511111" }, T0);
    expect(creator.services[0]!.title).toBe("1-day service");
  });

  it("leaves a title a creator wrote themselves alone", () => {
    const db = seedDb(T0);
    db.creators[0]!.services = [{ key: "videography", title: "My 1-day shoot deal", description: "x", price: 2500 }];
    tickAll(db, T0);
    expect(db.creators[0]!.services[0]!.title).toBe("My 1-day shoot deal");
  });
});

describe("fixed prices", () => {
  it("shows the menu's lowest price on every profile, never a creator's own", () => {
    const db = seedDb(T0);
    const { creator } = signUpCreator(
      db,
      { name: "New Creator", phone: "9876511112", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "video_editing", price: 50 }, { key: "videography" }] as never },
      { email: "fixed@example.com", phone: "9876511112" },
      T0,
    );
    expect(creator.services.every((s) => s.price === null)).toBe(true);

    db.creators[0]!.services = [{ key: "video_editing", title: "Old offer", description: "x", price: 50 }];
    const shown = creatorPublic(db.creators[0]!).services[0]!;
    expect(shown.price).toBe(lowestPrice("video_editing"));
    expect(shown.price).toBeGreaterThan(50);
  });

  it("has a price for every kind of service", () => {
    for (const s of SERVICES) expect(lowestPrice(s.key)).toBeGreaterThan(0);
  });
});

describe("several services in one order", () => {
  const ORDER = { cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Shoot our café and edit a separate reel" };

  it("makes one job per service, each with its own price", () => {
    const db = seedDb(T0);
    const list = createBookings(db, "u_priya", { ...ORDER, packageIds: ["video_tour", "edit_reel", "video_tour"] }, T0);
    expect(list.map((b) => [b.packageId, b.total, !!b.online])).toEqual([["video_tour", 1499, false], ["edit_reel", 999, true]]);
    expect(new Set(list.map((b) => b.code)).size).toBe(2);
  });

  it("applies the on-site notice to the whole order", () => {
    const db = seedDb(T0);
    const soon = { ...ORDER, scheduledAt: "2026-10-26T10:30" };
    expect(() => createBookings(db, "u_priya", { ...soon, packageIds: ["edit_reel", "video_tour"] }, T0)).toThrow(/1 hour/);
    expect(createBookings(db, "u_priya", { ...soon, packageIds: ["edit_reel"] }, T0)).toHaveLength(1);
  });

  it("refuses an empty order", () => {
    const db = seedDb(T0);
    expect(() => createBookings(db, "u_priya", { ...ORDER, packageIds: [] }, T0)).toThrow(/at least one/);
  });

  it("refunds each service on a shared payment separately", () => {
    const db = seedDb(T0);
    const [a, b] = createBookings(db, "u_priya", { ...ORDER, packageIds: ["video_tour", "edit_reel"] }, T0);
    recordPayment(db, a!, "pay_1", T0);
    recordPayment(db, b!, "pay_1", T0);
    refund(db, b!, "cancelled by client", T0);
    expect(refundsDue(db).map((r) => [r.id, r.amount])).toEqual([[b!.id, 999]]);
    expect(a!.status).toBe("searching");
    markRefundSent(db, b!.id, "UTR123", T0);
    expect(b!.refund).toMatchObject({ status: "sent", paymentRef: "UTR123" });
    expect(() => markRefundSent(db, b!.id, undefined, T0)).toThrow(/already/);
  });
});
