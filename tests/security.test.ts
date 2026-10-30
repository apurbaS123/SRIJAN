import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { checkIn, createBooking } from "@/lib/domain/bookings";
import { acceptOffer } from "@/lib/domain/dispatch";
import { setVerification, signUpCreator } from "@/lib/domain/creators";
import { createCampaign } from "@/lib/domain/campaigns";
import { DomainError, cleanUrl } from "@/lib/domain/util";
import { issueOtp, verifyOtp } from "@/lib/server/auth";
import { normalizePhone } from "@/lib/server/env";
import { MIN } from "@/lib/domain/config";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST
const base = { packageId: "quick_reel", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" };

describe("sign-in codes", () => {
  it("accepts the right code once and counts wrong guesses", () => {
    const db = seedDb(T0);
    const code = issueOtp(db, "9876500000", T0);
    expect(code).toMatch(/^\d{6}$/);
    expect(db.otps![0].codeHash).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    try {
      verifyOtp(db, "9876500000", wrong, T0);
      throw new Error("should have failed");
    } catch (e) {
      // keepChanges: the attempt counter is saved even though the request fails.
      expect((e as DomainError).keepChanges).toBe(true);
    }
    expect(db.otps![0].attempts).toBe(1);
    verifyOtp(db, "9876500000", code, T0);
    expect(() => verifyOtp(db, "9876500000", code, T0)).toThrow(/expired/);
  });

  it("locks after 5 wrong codes and expires after 10 minutes", () => {
    const db = seedDb(T0);
    const code = issueOtp(db, "9876500001", T0);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(() => verifyOtp(db, "9876500001", wrong, T0)).toThrow(/wrong/);
    expect(() => verifyOtp(db, "9876500001", code, T0)).toThrow(/Too many/);
    const db2 = seedDb(T0);
    const c2 = issueOtp(db2, "9876500002", T0);
    expect(() => verifyOtp(db2, "9876500002", c2, T0 + 11 * MIN)).toThrow(/expired/);
  });

  it("throttles code requests per number", () => {
    const db = seedDb(T0);
    issueOtp(db, "9876500003", T0);
    expect(() => issueOtp(db, "9876500003", T0 + 10_000)).toThrow(/wait a minute/);
    for (let i = 1; i < 5; i++) issueOtp(db, "9876500003", T0 + i * 2 * MIN);
    expect(() => issueOtp(db, "9876500003", T0 + 12 * MIN)).toThrow(/Too many/);
  });

  it("only accepts Indian mobile numbers", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("1234567890")).toBe("");
  });
});

describe("input hardening", () => {
  it("rejects non-http links", () => {
    expect(() => cleanUrl("javascript:alert(1)", "the link")).toThrow(/https/);
    expect(cleanUrl("https://drive.google.com/x", "the link")).toBe("https://drive.google.com/x");
    const db = seedDb(T0);
    expect(() => createBooking(db, "u_priya", { ...base, referenceUrl: "javascript:alert(1)" }, T0)).toThrow(/https/);
  });

  it("caps text lengths and checks enums", () => {
    const db = seedDb(T0);
    expect(() => createBooking(db, "u_priya", { ...base, brief: "x".repeat(5000) }, T0)).toThrow(/under/);
    expect(() => createBooking(db, "u_priya", { ...base, aspect: "4:3" as never }, T0)).toThrow(/format/);
    const campaign = { brandName: "Tea Co", contactName: "Asha", email: "a@tea.co", phone: "9876543210", goal: "", regions: [], budgetRange: "", callAt: "2026-10-28T11:00" };
    expect(() => createCampaign(db, { ...campaign, callMode: "carrier-pigeon" as never }, undefined, T0)).toThrow(/meet/);
    expect(() => createCampaign(db, { ...campaign, callMode: "video", regions: Array(50).fill("Assam") }, undefined, T0)).toThrow(/at most/);
  });
});

describe("creator KYC", () => {
  it("ignores self-declared KYC and needs ops to confirm documents", () => {
    const db = seedDb(T0);
    const input = { name: "New Creator", phone: "9876511111", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" as const }], aadhaarDone: true, panDone: true };
    const { creator } = signUpCreator(db, input, "9876511111", T0);
    expect(creator.kyc).toEqual({ aadhaar: false, pan: false });
    expect(() => setVerification(db, creator.id, "verified")).toThrow(/Aadhaar and PAN/);
    setVerification(db, creator.id, "verified", true);
    expect(creator.verification).toBe("verified");
    expect(creator.kyc).toEqual({ aadhaar: true, pan: true });
  });
});

describe("check-in start code", () => {
  it("locks after 5 wrong codes", () => {
    const db = seedDb(T0);
    const b = createBooking(db, "u_priya", base, T0);
    const o = db.offers.find((x) => x.bookingId === b.id && x.creatorId === "cr_ankita")!;
    acceptOffer(db, o.id, "cr_ankita", T0 + MIN);
    const wrong = b.otp === "0000" ? "1111" : "0000";
    for (let i = 0; i < 5; i++) expect(() => checkIn(db, b.id, "cr_ankita", wrong, b, SHOOT)).toThrow(/start code/);
    expect(() => checkIn(db, b.id, "cr_ankita", b.otp, b, SHOOT)).toThrow(/locked/);
  });
});
