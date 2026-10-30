import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { checkIn, createBooking } from "@/lib/domain/bookings";
import { acceptOffer } from "@/lib/domain/dispatch";
import { setVerification, signUpCreator } from "@/lib/domain/creators";
import { createCampaign } from "@/lib/domain/campaigns";
import { DomainError, cleanUrl } from "@/lib/domain/util";
import { issueOtp, verifyOtp } from "@/lib/server/auth";
import { isOpsEmail, normalizeEmail, normalizePhone } from "@/lib/server/env";
import { MIN } from "@/lib/domain/config";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST
const base = { packageId: "quick_reel", cityId: "guwahati", zoneId: "zoo-road", address: "Café Brahma, RG Baruah Road", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our café" };

describe("sign-in codes", () => {
  it("accepts the right code once and counts wrong guesses", () => {
    const db = seedDb(T0);
    const code = issueOtp(db, "user0@example.com", T0);
    expect(code).toMatch(/^\d{6}$/);
    expect(db.otps![0].codeHash).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    try {
      verifyOtp(db, "user0@example.com", wrong, T0);
      throw new Error("should have failed");
    } catch (e) {
      // keepChanges: the attempt counter is saved even though the request fails.
      expect((e as DomainError).keepChanges).toBe(true);
    }
    expect(db.otps![0].attempts).toBe(1);
    verifyOtp(db, "user0@example.com", code, T0);
    expect(() => verifyOtp(db, "user0@example.com", code, T0)).toThrow(/expired/);
  });

  it("locks after 5 wrong codes and expires after 10 minutes", () => {
    const db = seedDb(T0);
    const code = issueOtp(db, "user1@example.com", T0);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(() => verifyOtp(db, "user1@example.com", wrong, T0)).toThrow(/wrong/);
    expect(() => verifyOtp(db, "user1@example.com", code, T0)).toThrow(/Too many/);
    const db2 = seedDb(T0);
    const c2 = issueOtp(db2, "user2@example.com", T0);
    expect(() => verifyOtp(db2, "user2@example.com", c2, T0 + 11 * MIN)).toThrow(/expired/);
  });

  it("throttles code requests per email", () => {
    const db = seedDb(T0);
    issueOtp(db, "user3@example.com", T0);
    expect(() => issueOtp(db, "user3@example.com", T0 + 10_000)).toThrow(/wait a minute/);
    for (let i = 1; i < 5; i++) issueOtp(db, "user3@example.com", T0 + i * 2 * MIN);
    expect(() => issueOtp(db, "user3@example.com", T0 + 12 * MIN)).toThrow(/Too many/);
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
    const { creator } = signUpCreator(db, input, { email: "new.creator@example.com", phone: "9876511111" }, T0);
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

describe("creator social media link", () => {
  const join = (social: { platform?: string; url?: string } | undefined, phone = "9876522222") =>
    signUpCreator(seedDb(T0), { name: "New Creator", phone, cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" }], social }, { email: "creator@example.com", phone }, T0).creator;

  it("keeps a profile link on the chosen site, as https", () => {
    const c = join({ platform: "instagram", url: "www.instagram.com/new.creator" });
    expect(c.social).toEqual({ platform: "instagram", url: "https://www.instagram.com/new.creator" });
    expect(c.instagram).toBe("@new.creator");
    expect(join({ platform: "youtube", url: "http://m.youtube.com/@newcreator" }).social?.url).toBe("https://m.youtube.com/@newcreator");
  });

  it("is optional", () => {
    expect(join(undefined).social).toBeUndefined();
    expect(join({ platform: "instagram", url: "  " }).social).toBeUndefined();
  });

  it("refuses links to other sites, scripts and bare site addresses", () => {
    expect(() => join({ platform: "instagram", url: "https://evil.example/instagram.com" })).toThrow(/isn’t on Instagram/);
    expect(() => join({ platform: "instagram", url: "https://instagram.com.evil.example/me" })).toThrow(/isn’t on Instagram/);
    expect(() => join({ platform: "other", url: "javascript:alert(1)" })).toThrow(/profile link/);
    expect(() => join({ platform: "instagram", url: "https://instagram.com/" })).toThrow(/your own Instagram profile/);
    expect(() => join({ platform: "myspace", url: "https://myspace.com/me" })).toThrow(/Pick which site/);
  });

  it("allows any https site for a website or portfolio", () => {
    expect(join({ platform: "other", url: "newcreator.in" }).social?.url).toBe("https://newcreator.in/");
  });
});

describe("email sign-in", () => {
  it("normalises email addresses and rejects anything else", () => {
    expect(normalizeEmail("  Priya@Example.COM ")).toBe("priya@example.com");
    expect(normalizeEmail("not-an-email")).toBe("");
    expect(normalizeEmail("a@b")).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("gives ops access only to addresses in SRIJAN_OPS_EMAILS", () => {
    const before = process.env.SRIJAN_OPS_EMAILS;
    process.env.SRIJAN_OPS_EMAILS = " Team@Srijan.app , ops2@srijan.app";
    try {
      expect(isOpsEmail("team@srijan.app")).toBe(true);
      expect(isOpsEmail("ops2@srijan.app")).toBe(true);
      expect(isOpsEmail("someone@srijan.app")).toBe(false);
      expect(isOpsEmail("")).toBe(false);
    } finally {
      process.env.SRIJAN_OPS_EMAILS = before;
    }
  });

  it("refuses a second creator account for the same email", () => {
    const db = seedDb(T0);
    const input = { name: "New Creator", phone: "9876533333", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" as const }] };
    signUpCreator(db, input, { email: "same@example.com", phone: "9876533333" }, T0);
    expect(() => signUpCreator(db, input, { email: "same@example.com", phone: "9876544444" }, T0)).toThrow(/already registered/);
  });
});
