import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDb } from "./fixtures/seed";
import { updateOwnCreator, hasPayoutDetails, payoutSummary, signUpCreator } from "@/lib/domain/creators";
import { checkoutSignatureValid, createOrder, webhookSignatureValid } from "@/lib/server/razorpay";
import { bookingView, creatorPublic } from "@/lib/domain/views";
import { acceptOffer } from "@/lib/domain/dispatch";
import { createBooking, recordPayment } from "@/lib/domain/bookings";

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

    const b = createBooking(db, "u_priya", { packageId: "quick_reel", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" }, T0);
    recordPayment(db, b, "pay_1", T0);
    b.creatorId = creator.id;
    const seen = JSON.stringify(bookingView(db, b, { userId: "u_priya", role: "client" }));
    expect(seen).not.toContain("123456789012");
  });
});

describe("who sees which phone number", () => {
  it("shares the client's number only with the creator who took the job", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", { packageId: "video_edit", scheduledAt: "2026-10-26T15:00", brief: "Edit my café clips into one reel" }, T0);
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
